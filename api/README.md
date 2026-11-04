# CodeAI Adaptive Engine: API

Rails 7.1 API (Ruby 3.3) that implements the BRD core loop: diagnostic placement → coverage-guaranteed roadmap → submit → content filter → validate (probes + Bedrock rubric eval) → deterministic routing, with the non-adaptive fallback and a teacher-only attainment view. It serves the contract the frontend already uses (`web/src/api/httpApi.ts`, `web/src/api/types.ts`).

Runs on AWS Lambda behind an API Gateway HTTP API (via the [Lamby](https://lamby.cloud) gem), talking to Aurora PostgreSQL through the RDS Data API, so the Lambda needs no VPC or NAT.

## Layout

| Path | What |
|---|---|
| `config/curriculum/ai_generated_design.yml` | Authored unit: concepts, Stage descriptors, levels, transitions, probes, diagnostic. **Synthetic; T&L must replace and approve (FR7).** |
| `app/services/engine.rb` | Placement, deterministic routing (design §8), roadmap with coverage check (FR2), probes. Pure functions. |
| `app/services/validator.rb` | Probes + one parameterized Bedrock rubric prompt; probes cap the stage (design §7). |
| `app/services/model_client.rb` | Model abstraction over Bedrock Converse with a fallback model (NFR3, NFR6). |
| `app/services/content_filter.rb` | Fail-closed filtering on input and output: local PII check, then Bedrock Guardrails when `GUARDRAIL_ID` is set (FR11, NFR1). |
| `app/services/filter_audit.rb` | Filter audit log (M7): one `filter_event` row per check (no text) and the coverage report for `/api/teacher/safety`. |
| `app/services/routing_advisor.rb` | AI-advised routing: Bedrock picks the next level from the rule-approved candidates using the student's evidence; off-list picks, bad output or timeouts keep the rules' choice. Both choices are logged per decision. |
| `app/services/quality_judge.rb` | LLM-as-judge quality gate over `config/curriculum/quality_rubric.yml` (curriculum-quality rubric), with deterministic pre-checks (no evaluative wording, length, no copying from the source). |
| `app/services/practice_service.rb` | AI-generated formative practice (design §7A): generated for the student's current concept and stage, filtered and judged, with fallback to approved/authored practice (`config/curriculum/practice_bank.yml`). |
| `app/services/authoring_service.rb` | AI-assisted authoring (design §7B): drafts grounded in pasted source, provenance quotes verified against it, human approve/edit/reject. |
| `app/services/bit_agent_client.rb` | Calls the Bit tutor agent on AgentCore Runtime (`agent/`) with the student's own Cognito access token (`X-Agent-Token`); Coach falls back to direct Bedrock, then authored hints. |
| `app/services/coach.rb` | "Ask Bit" hints, scoped to the current step; authored hints if the model is down (FR8). |
| `app/services/lesson_service.rb` | Orchestration, fallback, student vs teacher DTOs. |
| `app/services/auth.rb` | Cognito ID-token verification, or demo header auth. |
| `app/services/db.rb` | Parameterized SQL with two drivers: `pg` (local) and `data_api` (Aurora). |
| `db/schema.sql` | Tables from design §5. Idempotent. |
| `benchmark/` | M5 benchmark set and agreement report. |
| `app.rb`, `Dockerfile` | Lambda entrypoint and container image. |

## Endpoints

| Method | Path | Who |
|---|---|---|
| GET | `/health` | anyone |
| GET | `/api/session` | signed in |
| GET | `/api/student/lesson` | student |
| GET/POST | `/api/student/diagnostic` | student |
| POST | `/api/student/levels/:level_id/submissions` | student |
| GET | `/api/student/submissions/:id` | student (own only) |
| POST | `/api/student/depth` | student |
| POST | `/api/student/levels/:level_id/assistant` | student |
| GET | `/api/teacher/class` | teacher (403 for students) |
| GET | `/api/teacher/students/:id` | teacher |
| GET | `/api/teacher/safety` | teacher. Filter audit log and coverage (M7); outcomes only, never text |
| POST | `/api/student/levels/:level_id/practice` | student. Formative practice for the current step: AI-generated, filtered and quality-judged, else approved/authored |
| POST | `/api/student/practice/:id/answers` | student. Formative feedback on a practice answer (never feeds the mastery signal) |
| GET | `/api/teacher/authoring` | teacher. Review queue, practice bank coverage, practice stats |
| POST | `/api/teacher/authoring/drafts` | teacher. AI drafts practice grounded in pasted source (PII redacted, filtered, judged, provenance-checked) |
| POST | `/api/teacher/authoring/items/:id/review` | teacher. `decision: approve|reject`, optional `edits` and `note` |
| GET | `/api/demo/users`, GET/POST `/api/demo/fault`, GET/POST `/api/demo/routing`, POST `/api/demo/reset` | `AUTH_MODE=demo` only, else 404 |

Student responses never contain stage, score, placement or rubric output (FR13). Validation runs in the request (design §3A MVP shape); the submit-then-poll contract is kept so SQS can be added later without frontend changes.

## Run locally

Needs Docker only.

```bash
cd api
docker network create codeai-dev
docker run -d --name codeai-db --network codeai-dev \
  -e POSTGRES_USER=codeai -e POSTGRES_PASSWORD=codeai -e POSTGRES_DB=codeai postgres:16

# install gems into api/vendor/bundle, then create tables and demo data
docker run --rm --network codeai-dev -u $(id -u):$(id -g) -e HOME=/tmp -e BUNDLE_PATH=/w/vendor/bundle \
  -e DATABASE_URL=postgres://codeai:codeai@codeai-db:5432/codeai -v "$PWD":/w -w /w ruby:3.3 \
  sh -c 'bundle install && bundle exec rake db:setup'

# serve on :3000 (VALIDATION_MODE=probes needs no AWS credentials)
docker run --rm --name codeai-api --network codeai-dev -p 3000:3000 -u $(id -u):$(id -g) -e HOME=/tmp -e RAILS_MAX_THREADS=1 \
  -e BUNDLE_PATH=/w/vendor/bundle -e DATABASE_URL=postgres://codeai:codeai@codeai-db:5432/codeai \
  -e AUTH_MODE=demo -e VALIDATION_MODE=probes -e ALLOWED_ORIGINS=http://localhost:5173 \
  -v "$PWD":/w -w /w ruby:3.3 bundle exec rails server -b 0.0.0.0 -p 3000
```

For the real Bedrock rubric eval locally, set `VALIDATION_MODE=model AWS_REGION=us-east-1` and pass credentials, for example `--env-file` from `aws configure export-credentials --profile workshop --format env-no-export` (keep that file out of git).

Point the frontend at it:

```bash
cd web
VITE_API_MODE=http VITE_API_URL=http://localhost:3000 VITE_DEMO_CONTROLS=true npm run dev
```

## Benchmark (M5)

```bash
VALIDATION_MODE=model bundle exec rake benchmark:run   # or probes
```

Prints exact-stage, within ±1, and pass/fail agreement against `benchmark/submissions.yml` and writes a JSON report to `benchmark/results/` (gitignored). The set is **synthetic and rated by the engineering team**; T&L must re-rate it and ratify the threshold before it counts as the launch gate.

## Deploying to Lambda (for the infra stack)

Build and push the image:

```bash
docker build -t codeai-api api/
# tag and push to an ECR repo, then create/update the function from the image
```

Lambda settings: package type **Image**, architecture **x86_64**, memory **1024 MB** (Rails boots faster with more CPU), timeout **29 s** (HTTP API limit is 30 s). No VPC needed with the Data API.

### Environment variables

| Name | Value |
|---|---|
| `DB_DRIVER` | `data_api` |
| `DB_CLUSTER_ARN` | Aurora cluster ARN (Data API enabled) |
| `DB_SECRET_ARN` | Aurora credentials secret ARN |
| `DB_NAME` | `codeai` |
| `AUTH_MODE` | `cognito` (default) or `demo` for the synthetic-data demo |
| `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` | required when `AUTH_MODE=cognito` |
| `COGNITO_REGION` | defaults to `AWS_REGION` |
| `ALLOWED_ORIGINS` | e.g. `https://main.d1w7uq7oiee3xh.amplifyapp.com` (comma-separated) |
| `VALIDATION_MODE` | `model` (default) or `probes` |
| `BEDROCK_MODEL_ID` | default `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `BEDROCK_FALLBACK_MODEL_ID` | default `us.amazon.nova-lite-v1:0` |
| `BEDROCK_REGION` | defaults to `AWS_REGION` |
| `GUARDRAIL_ID`, `GUARDRAIL_VERSION` | Bedrock Guardrail; without it only the local PII/unsafe check runs |
| `SECRET_KEY_BASE` | optional; nothing persistent is signed |

### IAM for the function role

- `rds-data:ExecuteStatement` on the cluster ARN; `secretsmanager:GetSecretValue` on the DB secret (plus `kms:Decrypt` if the secret uses a customer key).
- `bedrock:InvokeModel` on **both** the inference-profile ARNs (`arn:aws:bedrock:<region>:<account>:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`, `.../us.amazon.nova-lite-v1:0`) **and** the underlying foundation-model ARNs in every Region the `us.` profiles route to (`arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`, `arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0`). Converse uses the `InvokeModel` permission.
- `bedrock:ApplyGuardrail` on the guardrail ARN.
- CloudWatch Logs (`AWSLambdaBasicExecutionRole`).

Note: `anthropic.claude-3-haiku-20240307-v1:0` is end of life on Bedrock and rejects calls.

### API Gateway HTTP API

Single `$default` route → Lambda proxy integration (payload format 2.0). If API Gateway CORS is enabled, allow headers `Authorization`, `Content-Type`, `X-Demo-User` and methods `GET, POST, OPTIONS`.

### Create tables after the first deploy

```bash
aws lambda invoke --function-name <fn> --cli-binary-format raw-in-base64-out \
  --payload '{"codeai_task":"db:schema"}' /dev/stdout
# demo data (wipes rows): {"codeai_task":"db:seed"}, or both: {"codeai_task":"db:setup"}
```

Only `db:schema`, `db:seed` and `db:setup` are accepted. Aurora Serverless v2 at 0 ACU pauses when idle; the first query after a pause can take up to ~30 s, and the driver retries `DatabaseResumingException`.

## Known gaps

- The `data_api` driver has not been run against a real Aurora cluster yet (none deployed at the time of writing). The `pg` driver and every endpoint were verified locally.
- Curriculum lives in YAML under version control, not in database tables as design §5 sketches.
- No Langfuse tracing yet (NFR8, a Could); model metadata (model id, tokens, latency) is stored on each validation row.
- `AUTH_MODE=demo` trusts a header. Use it only with the synthetic demo data.
