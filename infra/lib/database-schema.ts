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
];

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
      cdk.Lazy.string({ produce: () => `${SCHEMA_STATEMENTS.length}` }),
    );
    const hash = `${SCHEMA_STATEMENTS.length}-${SCHEMA_STATEMENTS.join('|').length}`;

    // One ExecuteStatement call per statement. AwsCustomResource runs a single
    // SDK call, so we chain them as ordered custom resources that depend on one
    // another — guaranteeing CREATE TABLE ordering (FK targets exist first).
    let previous: cr.AwsCustomResource | undefined;

    SCHEMA_STATEMENTS.forEach((sql, index) => {
      const statement = new cr.AwsCustomResource(this, `Ddl${index}`, {
        // Scope the role to exactly the Data API + secret-read it needs.
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'rds-data:ExecuteStatement',
              'rds-data:BatchExecuteStatement',
            ],
            resources: [cluster.clusterArn],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['secretsmanager:GetSecretValue'],
            resources: [secret.secretArn],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['kms:Decrypt'],
            resources: [encryptionKey.keyArn],
          }),
        ]),
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
          physicalResourceId: cr.PhysicalResourceId.of(`codeai-ddl-${index}-${hash}`),
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
          physicalResourceId: cr.PhysicalResourceId.of(`codeai-ddl-${index}-${hash}`),
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
