# CodeAI Adaptive Learning Engine — Infrastructure (AWS CDK v2, TypeScript)

Infrastructure-as-Code for the MVP described in
[`../DESIGN-CodeAI-Adaptive-Learning-Engine-MVP.md`](../DESIGN-CodeAI-Adaptive-Learning-Engine-MVP.md)
and [`../BRD-CodeAI-Adaptive-Learning-Engine-MVP.md`](../BRD-CodeAI-Adaptive-Learning-Engine-MVP.md).

Region: **us-east-1**. Single CloudFormation stack: `CodeAiAdaptiveEngineMvp`.

> The stack `cdk synth`s cleanly and has been deploy-verified in a test account
> (us-east-1). Deploy with `cdk bootstrap` + `cdk deploy` (Docker required).

---

## What it provisions

| # | Requirement | How it is implemented |
|---|-------------|-----------------------|
| 1 | Cognito user pool + app client, `student` + `teacher` groups | `UserPool` (email sign-in, MFA optional, strong password policy), a public SPA app client (PKCE, no secret), two `CfnUserPoolGroup`s |
| 2 | Aurora PostgreSQL Serverless v2, scale-to-zero, secret | `DatabaseCluster` (Aurora PostgreSQL **16.8**), **Data API** enabled, `MinCapacity 0` / `MaxCapacity 1`, auto-pause after 5 min, credentials auto-generated into **Secrets Manager** (KMS-encrypted). No secret value in code. (See [Deviations](#deviations-from-the-original-brief) re: min ACU and engine version.) |
| 3 | Two private S3 buckets + CloudFront OAC + presigned artifacts | `SpaBucket` + `ArtifactsBucket`, both **Block Public Access ON** + **SSE-KMS** + TLS-only. SPA served by CloudFront using **Origin Access Control**. Artifacts reachable only via presigned URLs issued by the API. |
| 4 | Rails API compute | **AWS Lambda** (container image) + **Function URL**, `x86_64`, 512 MB (context-tunable), scale-to-zero. Ships a neutral placeholder image until the real Rails image is deployed. (App Runner was the original choice — see [Deviations](#deviations-from-the-original-brief).) |
| 5 | GitHub OIDC provider + scoped deploy role | `OpenIdConnectProvider` + `codeai-github-deploy` role, trust scoped to `repo:DemirhanCelik/Breaking-Barrier-2026-AWS:ref:refs/heads/main`, least-privilege deploy policy |
| 6 | API → Bedrock (invoke) + Guardrails | Instance role granted `bedrock:InvokeModel*` (scoped to the configured inference profile + the foundation models it routes to) and `bedrock:ApplyGuardrail` (scoped to the stack's **`codeai-content-guardrail`** `AWS::Bedrock::Guardrail`, which applies fail-closed input/output filtering per design §7 / NFR1) |

### Budget / security constraints (all enforced)

- **NO NAT gateways.** The VPC is created with `natGateways: 0` and only
  `PUBLIC` + `PRIVATE_ISOLATED` subnets — there is **no** private-with-egress
  subnet, so a NAT gateway cannot be provisioned. Aurora lives in the isolated
  subnets and is reached via the **Data API (HTTPS)**, not a VPC data path.
  The API **Lambda** has no VPC attachment, so it uses AWS-managed egress to
  reach Bedrock / Secrets Manager / Aurora Data API — **no VPC Connector and no
  NAT**. Verify yourself:
  ```bash
  grep -c "AWS::EC2::NatGateway" cdk.out/CodeAiAdaptiveEngineMvp.template.json   # => 0
  ```
- **Smallest / cheapest tiers**, nothing that bills heavily when idle: Aurora
  scales to **0 ACU** (auto-pause), the API Lambda scales to **zero** (pay
  per request, $0 idle), CloudFront is `PriceClass_100`.
- **Private by default, least privilege, KMS everywhere, no public S3.**
- **Parameterized** account id, region, repo, branch, Bedrock model id, API
  memory — all CDK context (see below), no hardcoded environment values in the
  stack logic.

> **No-NAT note:** a Lambda with no VPC attachment reaches Bedrock, Secrets
> Manager, and the Aurora Data API over AWS-managed egress, so there is no NAT
> and no interface-endpoint hourly charge. The production-shaped variant in the
> design (§9, §12) that attaches compute to private subnets would need **VPC
> interface endpoints** (Bedrock/Secrets Manager, ~$7.20/mo each) to stay
> NAT-free; that is intentionally **not** enabled here to keep idle cost at zero.

---

## Deviations from the original brief

These three choices differ from the literal brief; each is intentional and
documented here rather than made silently.

1. **Compute: Lambda + Function URL instead of App Runner.** App Runner was the
   requested compute, but `apprunner:CreateService` is **blocked by an SCP** in
   the target AWS accounts (confirmed at deploy time: *"no service control
   policy allows the apprunner:CreateService action"*). App Runner is therefore
   not deployable. A scale-to-zero Lambda behind a Function URL is the
   replacement: it is NAT-free, cheaper at idle (no always-on memory bill, no
   ALB), and aligns with the design's own Lambda-style scaling note (§9). The
   function ships a neutral placeholder image; swap it for the Rails image
   (bundling the AWS Lambda Web Adapter) when ready.
2. **Aurora minimum capacity 0 ACU, not 0.5.** The brief said min 0.5 ACU; the
   stack uses **min 0** (true scale-to-zero / auto-pause), which is strictly
   cheaper when idle and matches the design's Serverless-v2 autoscaling intent
   (§9). Raise `serverlessV2MinCapacity` to `0.5` if you need the cluster warm.
3. **Aurora PostgreSQL 16.8, not 16.6.** On RDS, `16.6` only exists as the
   separate `16.6-limitless` variant, so a standard `16.6` cluster fails to
   create. `16.8` is the nearest current standard version that supports
   Serverless v2 scale-to-zero.

Also note the Bedrock model default is the current **`us.anthropic.claude-haiku-4-5`**
inference profile — the originally-defaulted Claude 3 Haiku reached end-of-life.

---

## Prerequisites

- **Node.js ≥ 20** and npm (built/tested with Node 24, npm 11).
- **AWS CDK CLI** — the project pins `aws-cdk` locally, so `npx cdk ...` works
  without a global install. A global `cdk` ≥ 2.1000 also works.
- **AWS credentials** for account **`620829978601`**, region **us-east-1**, with
  permissions to create IAM, Cognito, RDS, S3, CloudFront, Lambda, Bedrock
  Guardrails, and an OIDC provider (needed only for `bootstrap` + the first
  `deploy`).
- **Docker** running locally — the API Lambda uses a container image, which CDK
  builds and pushes during `deploy` (and the placeholder image builds for
  `linux/amd64`).
- For the real API: replace the placeholder Lambda image with the Rails app
  image (bundling the AWS Lambda Web Adapter) in ECR.

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
| `codeai:bedrockModelId` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Bedrock model / inference profile the API may invoke |
| `codeai:apiMemoryMb` | `512` | Memory (MB) for the API Lambda; CPU scales with it |

Override any of them on the CLI, e.g.:

```bash
npx cdk synth -c codeai:region=us-east-1 -c codeai:apiMemoryMb=1024
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
`CloudFrontDomain`, `ApiFunctionName`, `ApiFunctionUrl`, `GuardrailId`,
`GuardrailArn`, `GitHubDeployRoleArn`, `KmsKeyArn`.

### 3. Post-deploy wiring (manual, MVP)

- Replace the placeholder Lambda image with your **Rails** image in ECR
  (`lambda:UpdateFunctionCode`, or `cdk deploy` after pointing the stack at it).
- Set the Cognito app client **callback/logout URLs** to your CloudFront domain.
- Build the SPA and sync it to `SpaBucketName`, then invalidate CloudFront.
- Change the API Function URL `authType` from `NONE` to Cognito/IAM auth once
  the real app enforces JWTs (it is open only for the placeholder).
- Tighten the OAC KMS key-policy condition to the specific distribution id.
- Tighten the artifacts bucket CORS `allowedOrigins` to the CloudFront domain.
- Promote the Bedrock Guardrail from `DRAFT` to a published version and set
  `BEDROCK_GUARDRAIL_VERSION` accordingly.

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
| **API Lambda + Function URL** | Scale-to-zero: **$0 when idle**. 512 MB x86_64; billed per request + GB-s only while handling traffic. First 1M requests + 400,000 GB-s/mo are free. An MVP demo is effectively free. Function URL has no hourly charge. | **~$0–1** |
| **S3 (2 buckets)** | A few GB of SPA + artifacts; requests negligible. ~$0.023/GB. | **< $0.50** |
| **CloudFront** | PriceClass_100; MVP demo traffic well within low-GB. ~$0.085/GB + request fees. | **~$0.50–2** |
| **Cognito** | First 10,000 MAUs free; MVP users are a handful. | **$0** |
| **KMS** | 1 customer-managed key = $1/mo + per-request (negligible). | **~$1** |
| **Secrets Manager** | 1 secret = $0.40/mo + API calls (negligible). | **~$0.40** |
| **GitHub OIDC provider + IAM roles** | IAM and OIDC providers are free. | **$0** |
| **VPC** | Subnets/route tables/IGW are free. **No NAT gateway → $0.** | **$0** |
| **Bedrock (invoke + Guardrails)** | Pay-per-token; Guardrails billed per text unit. Usage-driven; Claude Haiku is the cheapest Claude tier. Light MVP evals: a few dollars. | **~$1–10 (usage-driven)** |
| **Data transfer** | Minimal at MVP scale. | **~$0–1** |
| **Estimated total** | Idle-to-light MVP | **~$4–18/mo** (dominated by Bedrock usage; nearly everything else is $0 at idle) |

Notes:
- With Lambda compute there is **no fixed idle compute cost** — both the API
  (Lambda) and the database (Aurora auto-pause) go to **$0 when idle**. The only
  standing charges are KMS (~$1) and Secrets Manager (~$0.40).
- No NAT gateway saves the usual **~$32/mo each** — a major reason the estimate
  is this low.
- Bedrock is the only component that scales with real usage; cap it with the
  model choice (Haiku is the cheapest Claude tier).

---

## Project layout

```
infra/
  bin/infra.ts                  # CDK app entry; reads context params
  lib/codeai-infra-stack.ts     # the single MVP stack
  lib/placeholder-api/          # neutral Lambda image (swap for the Rails image)
    Dockerfile  app.js  package.json
  cdk.json                      # context defaults (account/region/repo/model)
  package.json / tsconfig.json
  README.md                     # this file
```
