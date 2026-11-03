# CodeAI Adaptive Learning Engine — Infrastructure (AWS CDK v2, TypeScript)

Infrastructure-as-Code for the MVP described in
[`../DESIGN-CodeAI-Adaptive-Learning-Engine-MVP.md`](../DESIGN-CodeAI-Adaptive-Learning-Engine-MVP.md)
and [`../BRD-CodeAI-Adaptive-Learning-Engine-MVP.md`](../BRD-CodeAI-Adaptive-Learning-Engine-MVP.md).

Region: **us-east-1**. Single CloudFormation stack: `CodeAiAdaptiveEngineMvp`.

> This project **does not deploy** anything by itself. It is scaffolded to
> `cdk synth` cleanly and is ready for you to `cdk bootstrap` + `cdk deploy`.

---

## What it provisions

| # | Requirement | How it is implemented |
|---|-------------|-----------------------|
| 1 | Cognito user pool + app client, `student` + `teacher` groups | `UserPool` (email sign-in, MFA optional, strong password policy), a public SPA app client (PKCE, no secret), two `CfnUserPoolGroup`s |
| 2 | Aurora PostgreSQL Serverless v2, min 0.5 ACU, scale-to-zero, secret | `DatabaseCluster` (Aurora PostgreSQL 16.6), **Data API** enabled, `MinCapacity 0` / `MaxCapacity 1`, auto-pause after 5 min, credentials auto-generated into **Secrets Manager** (KMS-encrypted). No secret value in code. |
| 3 | Two private S3 buckets + CloudFront OAC + presigned artifacts | `SpaBucket` + `ArtifactsBucket`, both **Block Public Access ON** + **SSE-KMS** + TLS-only. SPA served by CloudFront using **Origin Access Control**. Artifacts reachable only via presigned URLs issued by the API. |
| 4 | Rails API compute | **App Runner**, smallest size **0.25 vCPU / 0.5 GB** |
| 5 | GitHub OIDC provider + scoped deploy role | `OpenIdConnectProvider` + `codeai-github-deploy` role, trust scoped to `repo:DemirhanCelik/Breaking-Barrier-2026-AWS:ref:refs/heads/main`, least-privilege deploy policy |
| 6 | API → Bedrock (invoke) + Guardrails | Instance role granted `bedrock:InvokeModel*` (scoped to the configured model + inference profiles) and `bedrock:ApplyGuardrail` |

### Budget / security constraints (all enforced)

- **NO NAT gateways.** The VPC is created with `natGateways: 0` and only
  `PUBLIC` + `PRIVATE_ISOLATED` subnets — there is **no** private-with-egress
  subnet, so a NAT gateway cannot be provisioned. Aurora lives in the isolated
  subnets and is reached via the **Data API (HTTPS)**, not a VPC data path.
  App Runner uses default (managed) egress to reach Bedrock / Secrets Manager /
  Aurora Data API, so it needs **no VPC Connector and no NAT**. Verify yourself:
  ```bash
  grep -c "AWS::EC2::NatGateway" cdk.out/CodeAiAdaptiveEngineMvp.template.json   # => 0
  ```
- **Smallest / cheapest tiers**, nothing that bills heavily when idle: Aurora
  scales to **0 ACU** (auto-pause), App Runner is the smallest size, CloudFront
  is `PriceClass_100`.
- **Private by default, least privilege, KMS everywhere, no public S3.**
- **Parameterized** account id, region, repo, branch, Bedrock model id — all CDK
  context (see below), no hardcoded environment values in the stack logic.

> **No-NAT trade-off (flagged):** the MVP keeps App Runner in default egress
> mode so there is no NAT and no interface-endpoint hourly charge. The
> production-shaped variant in the design (§9, §12) puts App Runner behind a
> **VPC Connector** with **VPC interface endpoints** for Bedrock/Secrets Manager
> — still NAT-free, but those endpoints bill ~$7.20/mo each. That toggle is
> intentionally **not** enabled here to keep idle cost near zero.

---

## Prerequisites

- **Node.js ≥ 20** and npm (built/tested with Node 24, npm 11).
- **AWS CDK CLI** — the project pins `aws-cdk` locally, so `npx cdk ...` works
  without a global install. A global `cdk` ≥ 2.1000 also works.
- **AWS credentials** for account **`620829978601`**, region **us-east-1**, with
  permissions to create IAM, Cognito, RDS, S3, CloudFront, App Runner, and an
  OIDC provider (needed only for `bootstrap` + the first `deploy`).
- For the real API: a container image for the Rails app in ECR (the stack ships
  a placeholder public image so it synths and deploys before your image exists).

Install dependencies:

```bash
cd infra
npm install
```

---

## Configuration (CDK context)

All environment values are CDK context keys (defaults in `cdk.json`):

| Context key | Default | Meaning |
|-------------|---------|---------|
| `codeai:accountId` | `620829978601` | Target AWS account |
| `codeai:region` | `us-east-1` | Target region |
| `codeai:githubRepo` | `DemirhanCelik/Breaking-Barrier-2026-AWS` | OIDC trust repo |
| `codeai:githubBranch` | `main` | OIDC trust branch |
| `codeai:bedrockModelId` | `anthropic.claude-3-haiku-20240307-v1:0` | Model the API may invoke |

Override any of them on the CLI, e.g.:

```bash
npx cdk synth -c codeai:region=us-east-1 -c codeai:bedrockModelId=anthropic.claude-3-5-sonnet-20241022-v2:0
```

---

## Synth

```bash
cd infra
npm run synth        # or: npx cdk synth
```

Synthesizes offline (no AWS credentials required — AZs are pinned so there is no
context lookup). Two advisory warnings are expected and harmless:
- KMS wildcard in the OAC key policy (CDK does this on first deploy to avoid a
  circular dependency; scope it down after the first deploy).
- `minimumProtocolVersion` ignored because the SPA uses the default CloudFront
  certificate (only relevant with a custom domain).

---

## Deploy

Deploying to a **teammate's account** (`620829978601`)? See
[Deploying to an account you don't own](#deploying-to-an-account-you-dont-own).

### 1. Bootstrap (once per account+region)

```bash
cd infra
npx cdk bootstrap aws://620829978601/us-east-1
```

Creates the `CDKToolkit` stack (asset bucket, ECR repo, and the
`cdk-hnb659fds-*` roles the deploy role assumes).

### 2. Deploy

```bash
npx cdk deploy
# account id/region/repo come from cdk.json context; override with -c if needed
```

Useful outputs printed on success: `UserPoolId`, `UserPoolClientId`,
`AuroraClusterArn`, `AuroraSecretArn`, `SpaBucketName`, `ArtifactsBucketName`,
`CloudFrontDomain`, `ApiServiceUrl`, `GitHubDeployRoleArn`, `KmsKeyArn`.

### 3. Post-deploy wiring (manual, MVP)

- Point the App Runner service at your **private ECR** Rails image (replace the
  placeholder `imageIdentifier` + set `imageRepositoryType: ECR`).
- Set the Cognito app client **callback/logout URLs** to your CloudFront domain.
- Build the SPA and sync it to `SpaBucketName`, then invalidate CloudFront.
- Tighten the OAC KMS key-policy condition to the specific distribution id.
- Tighten the artifacts bucket CORS `allowedOrigins` to the CloudFront domain.

### Teardown

```bash
npx cdk destroy
```

All data resources use `RemovalPolicy.DESTROY` and buckets `autoDeleteObjects`
for a clean MVP teardown. **Change these for anything beyond the hackathon** so
you don't lose data on a stack replacement.

---

## Deploying to an account you don't own

The account `620829978601` is owned by a teammate. Pick one:

**A. Teammate bootstraps + first deploy, then everyone goes keyless (recommended).**
1. Teammate runs `cdk bootstrap aws://620829978601/us-east-1` and the first
   `cdk deploy` from their machine. This creates the GitHub OIDC provider and the
   `codeai-github-deploy` role.
2. After that, every deploy runs from **GitHub Actions** via OIDC — nobody shares
   credentials. See [`../.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).
   Add a repo variable `AWS_DEPLOY_ROLE_ARN` = the `GitHubDeployRoleArn` output.

**B. Assume a role in the teammate's account.** Teammate creates an IAM role you
   can assume (trusting your principal); you add it to an AWS profile and run
   `cdk deploy --profile <name>`. No long-lived keys shared.

**C. Temporary credentials.** Teammate issues short-lived STS credentials; you
   `aws configure` a profile and deploy. Rotate/delete after the hackathon. Avoid
   sharing root or long-lived admin keys.

The chicken-and-egg: the OIDC role that enables keyless deploys must be created
by one initial credentialed deploy (A or B). After that, CI is fully keyless.

---

## Monthly cost estimate (us-east-1 list price, MVP idle-to-light usage)

Rough, list-price, assuming a hackathon MVP that is mostly idle with light demo
traffic. Actual Bedrock cost depends entirely on tokens.

| Resource | Basis | Est. $/mo |
|----------|-------|-----------|
| **Aurora Serverless v2** | Scales to **0 ACU** when idle (auto-pause); ~0.5 ACU for a few demo hours. ACU ≈ $0.12/ACU-hr. ~20 active hrs → 0.5×20×0.12 ≈ $1.20. Storage ~1 GB ≈ $0.10. | **~$1–3** |
| **App Runner** | Smallest 0.25 vCPU / 0.5 GB. Provisioned (idle) memory billed even with no requests: ~$0.007/GB-hr → ~$2.5/mo for 0.5 GB always-on; active vCPU adds ~$0.064/vCPU-hr only while handling requests. | **~$3–6** |
| **S3 (2 buckets)** | A few GB of SPA + artifacts; requests negligible. ~$0.023/GB. | **< $0.50** |
| **CloudFront** | PriceClass_100; MVP demo traffic well within low-GB. ~$0.085/GB + request fees. | **~$0.50–2** |
| **Cognito** | First 10,000 MAUs free; MVP users are a handful. | **$0** |
| **KMS** | 1 customer-managed key = $1/mo + per-request (negligible). | **~$1** |
| **Secrets Manager** | 1 secret = $0.40/mo + API calls (negligible). | **~$0.40** |
| **GitHub OIDC provider + IAM roles** | IAM and OIDC providers are free. | **$0** |
| **VPC** | Subnets/route tables/IGW are free. **No NAT gateway → $0.** | **$0** |
| **Bedrock (invoke + Guardrails)** | Pay-per-token; Guardrails per-unit. Depends on usage; e.g. Claude 3 Haiku ≈ $0.25/M input + $1.25/M output tokens. Light MVP evals: a few dollars. | **~$1–10 (usage-driven)** |
| **Data transfer** | Minimal at MVP scale. | **~$0–1** |
| **Estimated total** | Idle-to-light MVP | **~$10–25/mo** (dominated by App Runner idle memory + Bedrock usage) |

Notes:
- The biggest *fixed* idle cost is **App Runner provisioned memory** (~$2.5/mo
  for 0.5 GB). Pausing/deleting the service between demos drops it to ~$0.
- Aurora genuinely goes to **$0 compute** when auto-paused; you pay only storage.
- No NAT gateway saves the usual **~$32/mo each** — the main reason the estimate
  is this low.
- Bedrock is the only component that scales with real usage; cap it with the
  model choice (Haiku is the cheapest Claude tier) and Guardrails only where
  needed.

---

## Project layout

```
infra/
  bin/infra.ts                  # CDK app entry; reads context params
  lib/codeai-infra-stack.ts     # the single MVP stack
  cdk.json                      # context defaults (account/region/repo/model)
  package.json / tsconfig.json
  README.md                     # this file
```
