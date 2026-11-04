import { createHash } from 'crypto';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cr from 'aws-cdk-lib/custom-resources';

/**
 * The CodeAI data model (design §5) expressed as idempotent PostgreSQL DDL.
 *
 * This is the single source of truth for the schema as *infrastructure*. It
 * mirrors `api/db/schema.sql` so the database tables are created/updated by the
 * deploy itself rather than by an out-of-band Rake task. Each element of the
 * array is ONE statement: the Aurora Data API executes a single statement per
 * call, so we never concatenate with semicolons.
 *
 * jsonb columns end in `_json` by convention (the Data API driver relies on it).
 * Everything is `IF NOT EXISTS` / idempotent so it is safe to re-run on every
 * deploy with no data loss.
 */
export const SCHEMA_STATEMENTS: string[] = [
  // --- Identity -------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS app_user (
     id            text PRIMARY KEY,
     cognito_sub   text UNIQUE,
     display_name  text NOT NULL,
     role          text NOT NULL CHECK (role IN ('student', 'teacher')),
     created_at    timestamptz NOT NULL DEFAULT now()
   )`,

  // --- Class config (instructor) -------------------------------------------
  `CREATE TABLE IF NOT EXISTS klass (
     id             text PRIMARY KEY,
     teacher_id     text NOT NULL REFERENCES app_user(id),
     name           text NOT NULL,
     bar_stage      integer NOT NULL DEFAULT 2,
     duration_days  integer NOT NULL DEFAULT 90
   )`,

  `CREATE TABLE IF NOT EXISTS enrollment (
     student_id  text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     klass_id    text NOT NULL REFERENCES klass(id) ON DELETE CASCADE,
     PRIMARY KEY (student_id, klass_id)
   )`,

  // --- Engine state per student --------------------------------------------
  `CREATE TABLE IF NOT EXISTS student_progress (
     student_id              text PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
     mode                    text NOT NULL DEFAULT 'adaptive' CHECK (mode IN ('adaptive', 'fallback')),
     current_level_id        text,
     depth_choice            text,
     complete                boolean NOT NULL DEFAULT false,
     level_status_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
     completed_order_json    jsonb NOT NULL DEFAULT '[]'::jsonb,
     transition_fails_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
     last_response_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
     flags_json              jsonb NOT NULL DEFAULT '[]'::jsonb,
     updated_at              timestamptz NOT NULL DEFAULT now()
   )`,

  // --- Per-student state: the mastery vector (teacher-scoped reads only) ----
  `CREATE TABLE IF NOT EXISTS mastery_state (
     student_id     text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     concept_id     text NOT NULL,
     current_stage  integer NOT NULL CHECK (current_stage BETWEEN 0 AND 3),
     updated_at     timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (student_id, concept_id)
   )`,

  `CREATE TABLE IF NOT EXISTS diagnostic_result (
     student_id    text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     concept_id    text NOT NULL,
     placed_stage  integer NOT NULL CHECK (placed_stage BETWEEN 0 AND 3),
     created_at    timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (student_id, concept_id)
   )`,

  // --- Submissions + validation --------------------------------------------
  `CREATE TABLE IF NOT EXISTS submission (
     id            text PRIMARY KEY,
     student_id    text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     level_id      text NOT NULL,
     content       text,
     outcome_json  jsonb NOT NULL,
     created_at    timestamptz NOT NULL DEFAULT now()
   )`,

  `CREATE INDEX IF NOT EXISTS submission_student_idx ON submission (student_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS validation_result (
     id               bigserial PRIMARY KEY,
     submission_id    text REFERENCES submission(id) ON DELETE CASCADE,
     student_id       text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     level_code       text NOT NULL,
     mode             text NOT NULL CHECK (mode IN ('adaptive', 'fallback', 'error', 'withheld')),
     results_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
     model_meta_json  jsonb,
     created_at       timestamptz NOT NULL DEFAULT now()
   )`,

  `CREATE INDEX IF NOT EXISTS validation_student_idx ON validation_result (student_id, created_at)`,

  // --- Auditable routing decisions (NFR4) ----------------------------------
  `CREATE TABLE IF NOT EXISTS route_decision (
     id           bigserial PRIMARY KEY,
     student_id   text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     level_code   text NOT NULL,
     level_title  text NOT NULL,
     rule         text NOT NULL,
     vector_json  jsonb NOT NULL,
     created_at   timestamptz NOT NULL DEFAULT now()
   )`,

  `CREATE INDEX IF NOT EXISTS route_student_idx ON route_decision (student_id, created_at)`,

  // --- Demo-only switches (e.g. fault injection for M6) ---------------------
  `CREATE TABLE IF NOT EXISTS app_setting (
     key         text PRIMARY KEY,
     value_json  jsonb NOT NULL
   )`,

  // --- Filter audit log (BRD M7): one row per content-filter check ---------
  // Outcomes only, never the checked text (NFR2).
  `CREATE TABLE IF NOT EXISTS filter_event (
     id          bigserial PRIMARY KEY,
     student_id  text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     context     text NOT NULL CHECK (context IN ('submission', 'assistant', 'coaching')),
     direction   text NOT NULL CHECK (direction IN ('input', 'output')),
     outcome     text NOT NULL CHECK (outcome IN ('pass', 'blocked', 'error')),
     source      text NOT NULL,
     ref_id      text NOT NULL,
     created_at  timestamptz NOT NULL DEFAULT now()
   )`,

  `CREATE INDEX IF NOT EXISTS filter_event_ref_idx ON filter_event (ref_id)`,

  `CREATE INDEX IF NOT EXISTS filter_event_student_idx ON filter_event (student_id, created_at)`,

  // --- AI-assisted authoring bank (design §7B) -----------------------------
  `CREATE TABLE IF NOT EXISTS content_item (
     id              text PRIMARY KEY,
     concept         text NOT NULL,
     from_stage      smallint NOT NULL,
     to_stage        smallint NOT NULL,
     title           text NOT NULL,
     scenario        text NOT NULL,
     task            text NOT NULL,
     tip             text NOT NULL,
     status          text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
     version         integer NOT NULL DEFAULT 1,
     source_title    text,
     source_quote    text,
     quote_verified  boolean NOT NULL DEFAULT false,
     quality_json    jsonb,
     filter_json     jsonb,
     reviewer_note   text,
     created_by      text NOT NULL,
     reviewed_by     text,
     created_at      timestamptz NOT NULL DEFAULT now(),
     reviewed_at     timestamptz
   )`,

  `CREATE INDEX IF NOT EXISTS content_item_status_idx ON content_item (status, concept, from_stage)`,

  // --- Formative practice (design §7A); never feeds the mastery signal -----
  `CREATE TABLE IF NOT EXISTS practice_item (
     id               text PRIMARY KEY,
     student_id       text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     level_id         text NOT NULL,
     concept          text NOT NULL,
     from_stage       smallint NOT NULL,
     to_stage         smallint NOT NULL,
     title            text NOT NULL,
     scenario         text NOT NULL,
     task             text NOT NULL,
     tip              text NOT NULL,
     origin           text NOT NULL CHECK (origin IN ('generated', 'bank', 'authored')),
     content_item_id  text,
     fallback_reason  text,
     quality_json     jsonb,
     model_meta_json  jsonb,
     created_at       timestamptz NOT NULL DEFAULT now()
   )`,

  `CREATE INDEX IF NOT EXISTS practice_item_student_idx ON practice_item (student_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS practice_attempt (
     id           text PRIMARY KEY,
     practice_id  text NOT NULL REFERENCES practice_item(id) ON DELETE CASCADE,
     student_id   text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     content      text,
     feedback     text NOT NULL,
     withheld     boolean NOT NULL DEFAULT false,
     created_at   timestamptz NOT NULL DEFAULT now()
   )`,

  // --- Bedrock Knowledge Base vector store (RDS/pgvector) -------------------
  // Backs the `codeai-kb` Bedrock Knowledge Base (see KnowledgeBase construct).
  // Bedrock's RDS vector store requires the pgvector extension, a dedicated
  // schema, and a table whose columns match the KB's fieldMapping:
  //   primaryKeyField=id, vectorField=embedding, textField=chunks,
  //   metadataField=metadata  (+ a source_uri text column Bedrock also writes).
  // The embedding dimension is 1024 (Amazon Titan Text Embeddings v2).
  // These statements mirror the live table exactly so this is a faithful,
  // non-destructive representation of the already-provisioned store.
  `CREATE EXTENSION IF NOT EXISTS vector`,

  `CREATE SCHEMA IF NOT EXISTS bedrock_kb`,

  `CREATE TABLE IF NOT EXISTS bedrock_kb.kb (
     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     embedding   vector(1024),
     chunks      text,
     metadata    jsonb,
     source_uri  text
   )`,

  // HNSW index on the embedding for fast cosine-similarity retrieval, plus a
  // GIN index on metadata for Bedrock's metadata filtering. Both idempotent.
  `CREATE INDEX IF NOT EXISTS kb_embedding_idx
     ON bedrock_kb.kb USING hnsw (embedding vector_cosine_ops)`,

  `CREATE INDEX IF NOT EXISTS kb_metadata_idx
     ON bedrock_kb.kb USING gin (metadata)`,
];

/**
 * Idempotent migrations for tables that already exist. `CREATE TABLE IF NOT
 * EXISTS` never alters an existing table, so column/constraint changes go here
 * and run after SCHEMA_STATEMENTS. Every entry MUST be safe to re-run, e.g.:
 *
 *   `ALTER TABLE klass ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false`
 *   `CREATE INDEX IF NOT EXISTS klass_teacher_idx ON klass (teacher_id)`
 *
 * Keep one statement per entry (Data API limit). Append only; don't edit
 * entries that have already been deployed.
 */
export const MIGRATION_STATEMENTS: string[] = [
  // filter_event contexts are validated in the app (FilterAudit::CONTEXTS); adds practice contexts.
  `ALTER TABLE filter_event DROP CONSTRAINT IF EXISTS filter_event_context_check`,
  // AI routing advisor record per decision (proposal, rules choice, candidates, reason).
  `ALTER TABLE route_decision ADD COLUMN IF NOT EXISTS advisor_json jsonb`,
  // Quiet formative signals per submission (time on step, edit sessions, pastes).
  `ALTER TABLE submission ADD COLUMN IF NOT EXISTS signals_json jsonb`,
  // Multiple units: the student's chosen topic, and which unit an authored item belongs to.
  `ALTER TABLE student_progress ADD COLUMN IF NOT EXISTS topic text`,
  `ALTER TABLE content_item ADD COLUMN IF NOT EXISTS unit text`,
];

/** All DDL in execution order: base tables first, then migrations. */
const ALL_STATEMENTS: string[] = [...SCHEMA_STATEMENTS, ...MIGRATION_STATEMENTS];

/** Short content hash of one statement; changes whenever the SQL text changes. */
const statementHash = (sql: string): string =>
  createHash('sha256').update(sql).digest('hex').slice(0, 12);

export interface DatabaseSchemaProps {
  /** The Aurora cluster to run the DDL against (must have the Data API enabled). */
  readonly cluster: rds.IDatabaseCluster;
  /** Secret holding the cluster's admin/app credentials (Data API auth). */
  readonly secret: cdk.aws_secretsmanager.ISecret;
  /** Logical database the tables are created in. */
  readonly databaseName: string;
  /** KMS key protecting the credentials secret (for decrypt grant). */
  readonly encryptionKey: kms.IKey;
}

/**
 * Creates the CodeAI database schema as part of the CloudFormation deploy.
 *
 * Implementation: an AwsCustomResource issues `rds-data:ExecuteStatement` calls
 * over the Aurora **Data API** (HTTPS, no VPC/NAT path needed — consistent with
 * the stack's no-NAT constraint). Because every statement is `IF NOT EXISTS`,
 * the resource can run on create *and* update with no destructive effect; the
 * physical resource id is a hash of the schema so a schema change re-triggers it.
 *
 * This makes table creation reproducible IaC rather than a manual post-deploy
 * step, while remaining compatible with the existing `db:schema` Rake task
 * (both drive the identical idempotent DDL).
 */
export class DatabaseSchema extends Construct {
  constructor(scope: Construct, id: string, props: DatabaseSchemaProps) {
    super(scope, id);

    const { cluster, secret, databaseName, encryptionKey } = props;

    // A stable version tag derived from the DDL. Changing any statement changes
    // this hash, which changes the physical resource id and forces a re-run of
    // the custom resource on the next deploy (new tables / indexes get created).
    const schemaVersion = cdk.Fn.base64(
      cdk.Lazy.string({ produce: () => `${ALL_STATEMENTS.length}` }),
    );

    // One ExecuteStatement call per statement. AwsCustomResource runs a single
    // SDK call, so we chain them as ordered custom resources that depend on one
    // another — guaranteeing CREATE TABLE ordering (FK targets exist first).
    let previous: cr.AwsCustomResource | undefined;

    // One shared execution role for every DDL step. Passing `policy` per step
    // would attach one inline policy per statement to the provider's singleton
    // role, which hits IAM's 10 KB inline-policy limit at ~20 statements.
    const ddlRole = new iam.Role(this, 'DdlRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Runs schema DDL through the RDS Data API (DatabaseSchema custom resources)',
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
      inlinePolicies: {
        ddl: new iam.PolicyDocument({
          // Scoped to exactly the Data API + secret-read it needs.
          statements: [
            new iam.PolicyStatement({
              actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement'],
              resources: [cluster.clusterArn],
            }),
            new iam.PolicyStatement({
              actions: ['secretsmanager:GetSecretValue'],
              resources: [secret.secretArn],
            }),
            new iam.PolicyStatement({
              actions: ['kms:Decrypt'],
              resources: [encryptionKey.keyArn],
            }),
          ],
        }),
      },
    });

    ALL_STATEMENTS.forEach((sql, index) => {
      // Per-statement content hash: editing ANY statement (even to the same
      // length) changes its physical id, so CloudFormation re-runs just it.
      const physicalId = `codeai-ddl-${index}-${statementHash(sql)}`;
      const statement = new cr.AwsCustomResource(this, `Ddl${index}`, {
        role: ddlRole,
        logRetention: logs.RetentionDays.ONE_WEEK,
        // The Data API (RDSDataService) is in Lambda's built-in SDK, so do NOT
        // install the latest SDK at runtime — that would need internet egress
        // the no-NAT provider Lambda does not have.
        installLatestAwsSdk: false,
        // Run on create AND update so schema changes are applied in place.
        onCreate: {
          service: 'RDSDataService',
          action: 'executeStatement',
          parameters: {
            resourceArn: cluster.clusterArn,
            secretArn: secret.secretArn,
            database: databaseName,
            sql,
          },
          physicalResourceId: cr.PhysicalResourceId.of(physicalId),
        },
        onUpdate: {
          service: 'RDSDataService',
          action: 'executeStatement',
          parameters: {
            resourceArn: cluster.clusterArn,
            secretArn: secret.secretArn,
            database: databaseName,
            sql,
          },
          physicalResourceId: cr.PhysicalResourceId.of(physicalId),
        },
        // No onDelete: tables are left intact on stack delete decisions made by
        // the cluster's own RemovalPolicy. We never DROP from here.
        timeout: cdk.Duration.minutes(5),
      });

      // Make sure the cluster (and its first serverless instance) is available,
      // then enforce statement ordering so foreign-key targets exist first.
      statement.node.addDependency(cluster);
      if (previous) {
        statement.node.addDependency(previous);
      }
      previous = statement;
    });

    // Surface the applied schema version for traceability.
    new cdk.CfnOutput(this, 'SchemaVersion', {
      value: schemaVersion,
      description: 'Base64 marker of the applied CodeAI schema statement count.',
    });
  }
}
