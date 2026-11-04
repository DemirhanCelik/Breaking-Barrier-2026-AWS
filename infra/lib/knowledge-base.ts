import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';

/**
 * Amazon Bedrock Knowledge Base (`codeai-kb`) and its data sources, expressed
 * as infrastructure.
 *
 * Storage: the KB uses the stack's Aurora PostgreSQL Serverless v2 cluster as
 * an RDS/pgvector vector store (table `bedrock_kb.kb`, created by the
 * DatabaseSchema construct). Embeddings use Amazon Titan Text Embeddings v2
 * (1024 dims). This keeps the KB on the same scale-to-zero, no-NAT data plane
 * as the rest of the stack — no OpenSearch Serverless (and its always-on OCU
 * bill) is introduced.
 *
 * Data sources (both read from the shared artifacts bucket, separated by prefix):
 *   - `codeai-docs`                 -> prefix `kb-source/`                (BRD, design, curriculum)
 *   - `codeorg-ai-foundations-unit6`-> prefix `kb-source-codeorg-unit6/`  (code.org Unit 6)
 *
 * The code.org Unit 6 content is refreshed on demand by
 * `infra/scripts/resync-codeorg-unit6.mjs`, which re-fetches the curriculum
 * from GitHub, re-uploads to the unit6 prefix, and starts an ingestion job.
 *
 * ---------------------------------------------------------------------------
 * ADOPTING THE EXISTING KB (one-time)
 * ---------------------------------------------------------------------------
 * `codeai-kb`, `codeai-kb-role`, and the two data sources were originally
 * created outside CloudFormation. The physical names and the vector-store
 * schema here match the live resources exactly, so you can bring them under
 * stack management with `cdk import` instead of letting a deploy create a
 * second, duplicate KB:
 *
 *   cd infra
 *   npx cdk import CodeAiInfraStack
 *   # when prompted, supply the existing physical ids:
 *   #   KnowledgeBase/Role (codeai-kb-role)         -> codeai-kb-role
 *   #   KnowledgeBase/Kb    (knowledge base id)      -> H8OMXBAFSF
 *   #   KnowledgeBase/DocsDataSource (data source id)-> TH9C5BWSCN
 *   #   KnowledgeBase/Unit6DataSource(data source id)-> 2DOXGUQV9W
 *
 * After import, `cdk diff` should be clean. If you instead deploy without
 * importing, CloudFormation will try to CREATE a new KB alongside the existing
 * one — do the import first.
 */
export interface KnowledgeBaseProps {
  /** Aurora cluster that holds the pgvector store (Data API enabled). */
  readonly cluster: rds.IDatabaseCluster;
  /** Secret with the cluster credentials Bedrock uses for the Data API. */
  readonly credentialsSecret: cdk.aws_secretsmanager.ISecret;
  /** Logical database the `bedrock_kb.kb` table lives in. */
  readonly databaseName: string;
  /** Bucket that stores the KB source documents. */
  readonly sourceBucket: s3.IBucket;
  /** KMS key protecting the bucket objects + DB secret (decrypt/generate grant). */
  readonly encryptionKey: kms.IKey;
  /**
   * Ensures the vector table exists before the KB is created. Pass the
   * DatabaseSchema construct (or any construct that provisions `bedrock_kb.kb`).
   */
  readonly schemaDependency?: Construct;
}

export class KnowledgeBase extends Construct {
  /** The created knowledge base (L1). */
  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  /** Convenience: the KB id for outputs / app wiring. */
  public readonly knowledgeBaseId: string;

  constructor(scope: Construct, id: string, props: KnowledgeBaseProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
    const {
      cluster,
      credentialsSecret,
      databaseName,
      sourceBucket,
      encryptionKey,
      schemaDependency,
    } = props;

    // Titan Text Embeddings v2 — matches the live KB (1024-dim embeddings).
    const embeddingModelArn = `arn:${stack.partition}:bedrock:${stack.region}::foundation-model/amazon.titan-embed-text-v2:0`;

    // -----------------------------------------------------------------------
    // KB service role (mirrors the live `codeai-kb-role`): embed model invoke,
    // read the source bucket, KMS for SSE-KMS objects + the DB secret, and the
    // Aurora Data API to read/write the vector table.
    // -----------------------------------------------------------------------
    const role = new iam.Role(this, 'Role', {
      roleName: 'codeai-kb-role',
      description: 'Service role for the codeai-kb Bedrock Knowledge Base.',
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com', {
        // Confused-deputy protection: only this account's KBs may assume it.
        conditions: {
          StringEquals: { 'aws:SourceAccount': stack.account },
          ArnLike: {
            'aws:SourceArn': `arn:${stack.partition}:bedrock:${stack.region}:${stack.account}:knowledge-base/*`,
          },
        },
      }),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'Embed',
        actions: ['bedrock:InvokeModel'],
        resources: [embeddingModelArn],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'S3',
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: [sourceBucket.bucketArn, `${sourceBucket.bucketArn}/*`],
        conditions: { StringEquals: { 'aws:ResourceAccount': stack.account } },
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'Kms',
        actions: ['kms:Decrypt', 'kms:GenerateDataKey', 'kms:DescribeKey'],
        resources: [encryptionKey.keyArn],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DataApi',
        actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement'],
        resources: [cluster.clusterArn],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DescribeCluster',
        actions: ['rds:DescribeDBClusters'],
        resources: [cluster.clusterArn],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'Secret',
        actions: ['secretsmanager:GetSecretValue'],
        resources: [credentialsSecret.secretArn],
      }),
    );

    // -----------------------------------------------------------------------
    // The knowledge base: VECTOR type, Titan embeddings, RDS/pgvector storage.
    // fieldMapping must match the `bedrock_kb.kb` columns created in the schema.
    // -----------------------------------------------------------------------
    const kb = new bedrock.CfnKnowledgeBase(this, 'Kb', {
      name: 'codeai-kb',
      description: 'CodeAI project docs (BRD, design, curriculum) + code.org Unit 6.',
      roleArn: role.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn,
          embeddingModelConfiguration: {
            bedrockEmbeddingModelConfiguration: { dimensions: 1024 },
          },
        },
      },
      storageConfiguration: {
        type: 'RDS',
        rdsConfiguration: {
          resourceArn: cluster.clusterArn,
          credentialsSecretArn: credentialsSecret.secretArn,
          databaseName,
          tableName: 'bedrock_kb.kb',
          fieldMapping: {
            primaryKeyField: 'id',
            vectorField: 'embedding',
            textField: 'chunks',
            metadataField: 'metadata',
          },
        },
      },
    });
    kb.node.addDependency(role);
    // The vector table must exist before Bedrock validates the store.
    if (schemaDependency) {
      kb.node.addDependency(schemaDependency);
    }

    // -----------------------------------------------------------------------
    // Data sources — both on the shared bucket, separated by inclusion prefix.
    // -----------------------------------------------------------------------
    const docsDataSource = new bedrock.CfnDataSource(this, 'DocsDataSource', {
      knowledgeBaseId: kb.attrKnowledgeBaseId,
      name: 'codeai-docs',
      description: 'CodeAI project docs (BRD, design, curriculum).',
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: sourceBucket.bucketArn,
          inclusionPrefixes: ['kb-source/'],
        },
      },
    });

    const unit6DataSource = new bedrock.CfnDataSource(this, 'Unit6DataSource', {
      knowledgeBaseId: kb.attrKnowledgeBaseId,
      name: 'codeorg-ai-foundations-unit6',
      description:
        'code.org AI Foundations Year 1 (2026) Unit 6: AI-Generated Design. ' +
        'Lessons, resources, objectives, learning goals from ai-generated-design-2026.',
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: sourceBucket.bucketArn,
          inclusionPrefixes: ['kb-source-codeorg-unit6/'],
        },
      },
    });
    docsDataSource.addResourceDependency(kb);
    unit6DataSource.addResourceDependency(kb);

    this.knowledgeBase = kb;
    this.knowledgeBaseId = kb.attrKnowledgeBaseId;

    new cdk.CfnOutput(stack, 'KnowledgeBaseId', { value: kb.attrKnowledgeBaseId });
    new cdk.CfnOutput(stack, 'KnowledgeBaseDocsDataSourceId', {
      value: docsDataSource.attrDataSourceId,
    });
    new cdk.CfnOutput(stack, 'KnowledgeBaseUnit6DataSourceId', {
      value: unit6DataSource.attrDataSourceId,
    });
  }
}
