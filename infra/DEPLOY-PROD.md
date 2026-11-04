# Prod deployment — Knowledge Base + code.org Unit 6

Handoff for the **prod account admin**. This brings up the full CodeAI stack
(including the `codeai-kb` Bedrock Knowledge Base and its two S3 data sources)
and seeds the Knowledge Base with the code.org "AI-Generated Design" (Unit 6)
curriculum.

The prod account is assumed **empty** (no prior deploy). Everything below runs
with **prod admin credentials from a workstation** — the push-triggered GitHub
Actions workflow can't do the first deploy, because the OIDC role it assumes
(`codeai-github-deploy`) does not exist until this stack creates it.

---

## Prerequisites

- AWS credentials for the **prod account** (admin / deploy-capable).
- **Docker running** — the deploy builds container images (Rails API Lambda +
  the Bit agent) and pushes them to ECR.
- **Node 18+** and **AWS CLI v2** on PATH.
- **Amazon Bedrock model access enabled** in the deploy region
  (default `us-east-1`), one-time per account in the Bedrock console:
  - `amazon.titan-embed-text-v2:0` (the KB embedding model)
  - the Claude Haiku inference profile the app uses
    (`us.anthropic.claude-haiku-4-5-20251001-v1:0`)

Set these once for the session:

```bash
export PROD_ACCOUNT_ID=<prod account id>
export AWS_REGION=us-east-1
export GH_REPO=<github-org/repo>     # the repo CI deploys from; scopes the OIDC role trust
```

---

## 1. Deploy the stack

```bash
cd infra
npm ci

# one-time per account + region
npx cdk bootstrap \
  -c codeai:accountId=$PROD_ACCOUNT_ID \
  -c codeai:region=$AWS_REGION

# creates EVERYTHING fresh: Cognito, Aurora, S3, CloudFront, API Lambda,
# the Bit agent, AND the Knowledge Base + its two data sources.
# NOTE: this is a fresh account, so do NOT run `cdk import` — just deploy.
npx cdk deploy \
  -c codeai:accountId=$PROD_ACCOUNT_ID \
  -c codeai:region=$AWS_REGION \
  -c codeai:githubRepo=$GH_REPO \
  --require-approval never \
  --outputs-file cdk-outputs.json
```

After this, the Knowledge Base and both data sources **exist but are empty** —
CDK provisions infrastructure, it does not load documents or run ingestion.

Relevant stack outputs (in `cdk-outputs.json`):

- `KnowledgeBaseId`
- `KnowledgeBaseUnit6DataSourceId`
- `KnowledgeBaseDocsDataSourceId`
- `ArtifactsBucketName`
- `KmsKeyArn`
- `GitHubDeployRoleArn`  (needed to wire CI, step 4)

---

## 2. Seed the Knowledge Base with Unit 6

The re-sync script fetches the unit from GitHub, uploads it to S3, and runs an
ingestion job. It resolves the KB id, data-source id, bucket, and KMS key
**automatically from the stack's CloudFormation outputs** — no hand-editing.

```bash
# from infra/
node scripts/resync-codeorg-unit6.mjs
```

If the stack name differs from the default (`CodeAiAdaptiveEngineMvp`) or you
deployed to another region:

```bash
node scripts/resync-codeorg-unit6.mjs --stack <StackName> --region <region>
```

Expected tail of a successful run:

```
[resync] target: kb=... dataSource=... bucket=... region=us-east-1
[resync] COMPLETE — scanned 17, indexed 17, deleted 0, failed 0
```

(`indexed 0` instead of `17` just means the content was unchanged since the last
run — that's the normal idempotent result on a re-run.)

Re-run this script any time to refresh Unit 6 from code.org.

---

## 3. (Optional) Seed the other KB data source — project docs

The `codeai-docs` data source (prefix `kb-source/`) covers the BRD, design, and
curriculum docs. It is **not** handled by the Unit 6 script. To populate it,
upload those docs to the artifacts bucket under `kb-source/` and start an
ingestion job on `KnowledgeBaseDocsDataSourceId`, e.g.:

```bash
BUCKET=$(jq -r '.CodeAiAdaptiveEngineMvp.ArtifactsBucketName' cdk-outputs.json)
KEY=$(jq -r '.CodeAiAdaptiveEngineMvp.KmsKeyArn' cdk-outputs.json)
KB=$(jq -r '.CodeAiAdaptiveEngineMvp.KnowledgeBaseId' cdk-outputs.json)
DS=$(jq -r '.CodeAiAdaptiveEngineMvp.KnowledgeBaseDocsDataSourceId' cdk-outputs.json)

aws s3 sync <local-docs-dir>/ "s3://$BUCKET/kb-source/" \
  --region "$AWS_REGION" --sse aws:kms --sse-kms-key-id "$KEY"

aws bedrock-agent start-ingestion-job \
  --knowledge-base-id "$KB" --data-source-id "$DS" --region "$AWS_REGION"
```

---

## 4. (Optional) Hand ongoing deploys to CI

After the first manual deploy, GitHub Actions (`.github/workflows/deploy.yml`)
can take over on every push to `main`:

1. Set repo **variable** `AWS_DEPLOY_ROLE_ARN` = the `GitHubDeployRoleArn` output.
2. If the repo differs from the default trusted repo, redeploy with
   `-c codeai:githubRepo=<org/repo>` so the OIDC role trusts it.
3. (Optional) set repo variable `DEMO_PASSWORD` for the demo Cognito accounts.

The role's trust is scoped to `main`, so only `main` can assume it.

---

## Notes / gotchas

- **Aurora Serverless v2 scales to zero.** The first KB ingestion after idle may
  pause while the cluster resumes; the resync script retries automatically.
- **Web crawler is not used.** Bedrock's native web crawler requires an
  OpenSearch Serverless store; this KB is Aurora/pgvector, so Unit 6 content is
  fetched to S3 and ingested via an S3 data source instead.
- **Google Docs resources aren't ingested.** The Unit 6 docs list links to
  Google Docs (the `.course` resources). Those require auth and are referenced,
  not crawled.
