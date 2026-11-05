import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as agentcore from 'aws-cdk-lib/aws-bedrockagentcore';
import { IgnoreMode } from 'aws-cdk-lib';
import * as path from 'path';
import { DatabaseSchema } from './database-schema';
import { KnowledgeBase } from './knowledge-base';

export interface CodeAiInfraStackProps extends cdk.StackProps {
  /** GitHub repo in "owner/name" form used to scope the OIDC trust policy. */
  readonly githubRepo: string;
  /** Branch allowed to assume the deploy role (e.g. "main"). */
  readonly githubBranch: string;
  /** Bedrock model id the API is permitted to invoke. */
  readonly bedrockModelId: string;
  /** Memory (MB) for the API Lambda. CPU scales with memory; 512 is a good
   *  cost/responsiveness balance for Rails. */
  readonly apiMemoryMb: number;
}

/**
 * Single-stack MVP infrastructure for the CodeAI Adaptive Learning Engine.
 *
 * Budget/security constraints enforced here:
 *  - NO NAT GATEWAYS. Aurora uses the Data API (HTTP over the AWS network), and
 *    the API Lambda runs with managed egress (no VPC attachment), so neither
 *    needs a NAT path.
 *  - Everything smallest/cheapest tier; Aurora Serverless v2 scales to zero and
 *    the API Lambda scales to zero (pay-per-request, $0 idle).
 *  - Private by default: both S3 buckets Block Public Access + SSE-KMS.
 *  - Least privilege IAM; customer-managed KMS keys; no hardcoded secrets.
 */
export class CodeAiInfraStack extends cdk.Stack {
  /**
   * Pin the AZs deterministically instead of letting the VPC construct query the
   * live account. This keeps `cdk synth` fully offline (no credentials / no
   * lookup role needed) and gives a stable 2-AZ layout in us-east-1. If you
   * deploy to a different region, override via the CDK `availability-zones`
   * context or adjust these values.
   */
  get availabilityZones(): string[] {
    return [`${this.region}a`, `${this.region}b`];
  }

  constructor(scope: Construct, id: string, props: CodeAiInfraStackProps) {
    super(scope, id, props);

    // =========================================================================
    // 0. VPC (no NAT) — the DB lives in ISOLATED subnets only.
    // =========================================================================
    // natGateways: 0 is the hard budget constraint. We create only PUBLIC and
    // PRIVATE_ISOLATED subnets. There are NO private-with-egress subnets, so it
    // is structurally impossible for this stack to provision a NAT gateway.
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          // Isolated = no route to the internet and no NAT. Aurora sits here and
          // is reached only via the Data API (HTTPS), never a NAT-backed path.
          name: 'db-isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // =========================================================================
    // 1. KMS — one customer-managed key for data-at-rest (S3 + Aurora + Secret).
    // =========================================================================
    const dataKey = new kms.Key(this, 'DataKey', {
      alias: 'alias/codeai/data',
      description: 'CodeAI MVP data-at-rest key (S3 buckets, Aurora, secrets).',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // MVP: tear down cleanly.
    });

    // =========================================================================
    // 2. Cognito user pool + app client + student/teacher groups.
    // =========================================================================
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'codeai-adaptive-engine',
      selfSignUpEnabled: false, // instructor/admin-provisioned for the MVP.
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      // Relaxed for the hackathon demo pool (short shared demo password).
      // Raise to 12+ with symbols before any real users.
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // MVP.
    });

    const userPoolClient = userPool.addClient('WebClient', {
      userPoolClientName: 'codeai-web-spa',
      generateSecret: false, // public SPA (PKCE) client — no client secret.
      // userPassword: the SPA calls Cognito InitiateAuth (USER_PASSWORD_AUTH)
      // directly over TLS, without the Amplify SDK.
      authFlows: { userSrp: true, userPassword: true },
      // Users may edit only their email. preferred_username is admin-set and
      // binds a Cognito user to a pre-seeded app_user row (api Auth.provision),
      // so it must not be self-writable.
      writeAttributes: new cognito.ClientAttributes().withStandardAttributes({ email: true }),
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        // Callback/logout URLs are set at deploy time once the CloudFront
        // domain (or a custom domain) is known. Left generic for the MVP scaffold.
        callbackUrls: ['https://localhost:5173/callback'],
        logoutUrls: ['https://localhost:5173/logout'],
      },
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // The two role groups from the design. JWT group claim drives API authz.
    new cognito.CfnUserPoolGroup(this, 'StudentGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'student',
      description: 'Students — formative, stage data never surfaced to them.',
      precedence: 20,
    });
    new cognito.CfnUserPoolGroup(this, 'TeacherGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'teacher',
      description: 'Teachers — read-only attainment view; owns classes.',
      precedence: 10,
    });
    // Admins — approve AI-generated content and upload a unit's concept matrix.
    // Never see student progress (teacher-progress endpoints exclude them).
    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'admin',
      description: 'Admins — approve AI content, upload curriculum matrix; no student progress.',
      precedence: 5,
    });

    // =========================================================================
    // 3. Aurora PostgreSQL Serverless v2 — Data API, scale-to-zero, secret.
    // =========================================================================
    // Credentials are generated and stored in Secrets Manager (KMS-encrypted).
    // No secret value is ever present in this template.
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      description: 'Aurora cluster SG - no inbound; access is via Data API only.',
      allowAllOutbound: false,
    });

    const dbCredentials = rds.Credentials.fromGeneratedSecret('codeai_app', {
      secretName: 'codeai/aurora/app-credentials',
      encryptionKey: dataKey,
    });

    const dbCluster = new rds.DatabaseCluster(this, 'Aurora', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        // 16.8 is a currently-available standard Aurora PostgreSQL version that
        // supports Serverless v2 scale-to-zero. (16.6 only exists as the
        // separate "-limitless" variant, which is why the first deploy failed.)
        version: rds.AuroraPostgresEngineVersion.VER_16_8,
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      credentials: dbCredentials,
      defaultDatabaseName: 'codeai',
      // Serverless v2 scale-to-zero: minCapacity 0 ACU auto-pauses the cluster
      // when idle. We set the floor to 0 and let it park; set
      // serverlessV2AutoPauseDuration to control how quickly it pauses.
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 1, // smallest sensible ceiling for the MVP.
      serverlessV2AutoPauseDuration: cdk.Duration.minutes(5),
      writer: rds.ClusterInstance.serverlessV2('writer', {
        publiclyAccessible: false,
      }),
      // Data API removes the need for a VPC data path from App Runner => NO NAT.
      enableDataApi: true,
      storageEncrypted: true,
      storageEncryptionKey: dataKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // MVP.
    });

    // =========================================================================
    // 3b. Database schema (data model, design §5) as IaC.
    // =========================================================================
    // Create/maintain the tables as part of the deploy via the Aurora Data API
    // (HTTPS, no NAT path). Idempotent DDL — safe on every create/update. This
    // replaces the out-of-band `rake db:schema` step with reproducible IaC.
    let databaseSchema: DatabaseSchema | undefined;
    if (dbCluster.secret) {
      databaseSchema = new DatabaseSchema(this, 'DatabaseSchema', {
        cluster: dbCluster,
        secret: dbCluster.secret,
        databaseName: 'codeai',
        encryptionKey: dataKey,
      });
    }

    // =========================================================================
    // 4. Private S3 buckets — SPA + artifacts. BPA on, SSE-KMS, no public access.
    // =========================================================================
    const commonBucketProps: s3.BucketProps = {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: dataKey,
      enforceSSL: true, // deny any non-TLS request.
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // MVP.
      autoDeleteObjects: true, // MVP convenience for clean teardown.
    };

    const spaBucket = new s3.Bucket(this, 'SpaBucket', {
      ...commonBucketProps,
    });

    const artifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
      ...commonBucketProps,
      // Artifacts are reached ONLY via short-lived presigned URLs from the API.
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
          allowedOrigins: ['*'], // tighten to the CloudFront domain post-deploy.
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    // =========================================================================
    // 4b. Bedrock Knowledge Base (codeai-kb) — RDS/pgvector store on Aurora,
    //     two S3 data sources (project docs + code.org Unit 6). See
    //     knowledge-base.ts for the one-time `cdk import` adoption note.
    // =========================================================================
    if (dbCluster.secret) {
      new KnowledgeBase(this, 'KnowledgeBase', {
        cluster: dbCluster,
        credentialsSecret: dbCluster.secret,
        databaseName: 'codeai',
        sourceBucket: artifactsBucket,
        encryptionKey: dataKey,
        schemaDependency: databaseSchema,
      });
    }

    // =========================================================================
    // 5. CloudFront in front of the SPA bucket using Origin Access Control (OAC).
    // =========================================================================
    const distribution = new cloudfront.Distribution(this, 'SpaDistribution', {
      comment: 'CodeAI SPA — private S3 origin via OAC.',
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // cheapest (NA+EU edges).
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        // S3BucketOrigin.withOriginAccessControl wires OAC + the bucket policy
        // that grants ONLY this distribution read access to the private bucket.
        origin: origins.S3BucketOrigin.withOriginAccessControl(spaBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      },
      // SPA client-side routing: serve index.html for 403/404 from S3.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    // =========================================================================
    // 6. IAM: App Runner instance role — least-privilege runtime permissions.
    //    (Data API on Aurora, read the DB secret, S3 artifacts, Bedrock + Guardrails.)
    // =========================================================================
    const apiInstanceRole = new iam.Role(this, 'ApiInstanceRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Runtime role for the Rails API Lambda (least privilege).',
      managedPolicies: [
        // CloudWatch Logs for the function; no VPC access policy (no VPC attach).
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    // 6a. Aurora Data API (execute statements against the cluster).
    dbCluster.grantDataApiAccess(apiInstanceRole);

    // 6b. Read ONLY the generated DB credentials secret (KMS decrypt included).
    dbCluster.secret?.grantRead(apiInstanceRole);

    // 6c. Artifacts bucket: object-level read/write for presigned URL issuance.
    artifactsBucket.grantReadWrite(apiInstanceRole);
    dataKey.grantEncryptDecrypt(apiInstanceRole); // for SSE-KMS object access.

    // 6d. Bedrock: invoke the configured model + apply Guardrails. Scoped to
    //     Bedrock resources in this account/partition; not a blanket bedrock:*.
    //
    //     The configured model id is a CROSS-REGION INFERENCE PROFILE
    //     (e.g. "us.anthropic.claude-haiku-4-5-..."). Invoking a profile needs:
    //       (a) the inference-profile ARN, AND
    //       (b) the underlying foundation-model ARNs in EVERY region the profile
    //           may route to (us-east-1, us-east-2, us-west-2 for "us." profiles).
    //     Granting only the single-region foundation-model ARN would fail with
    //     AccessDenied when the profile fans out, so we grant the foundation
    //     models across the US regions the "us." profile uses.
    const usProfileRegions = ['us-east-1', 'us-east-2', 'us-west-2'];
    const foundationModelArns = usProfileRegions.map(
      (r) => `arn:${this.partition}:bedrock:${r}::foundation-model/*`,
    );

    apiInstanceRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'BedrockInvokeModel',
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: [
          // The inference profile in this account/region.
          `arn:${this.partition}:bedrock:${this.region}:${this.account}:inference-profile/*`,
          // The foundation models the profile routes to, across US regions.
          ...foundationModelArns,
        ],
      }),
    );

    // Content-filtering Guardrail (design §7 / NFR1: fail-closed filtering on
    // input and output). A minimal, sensible-default guardrail the API applies
    // on both student input and model output. Tune categories/strengths to the
    // curriculum's safety needs.
    const guardrail = new bedrock.CfnGuardrail(this, 'ContentGuardrail', {
      name: 'codeai-content-guardrail',
      description:
        'Fail-closed input/output content filtering for the adaptive engine.',
      // Shown when content is blocked (student-facing, non-evaluative).
      blockedInputMessaging:
        "Let's keep this focused on the lesson — try rephrasing your request.",
      blockedOutputsMessaging:
        'That response was withheld. Let us try a different approach.',
      contentPolicyConfig: {
        filtersConfig: [
          { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'VIOLENCE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          // Prompt-attack filtering applies to input only (per Bedrock).
          { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
        ],
      },
      // Student privacy (Safety Tenet, NFR2). Contact details are blocked.
      // Names, ages and usernames are masked rather than blocked, because lesson
      // answers legitimately mention sample names ("If I RSVP as Sam..."); the API
      // stores and sends to the model only the masked text.
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          { type: 'ADDRESS', action: 'BLOCK' },
          { type: 'EMAIL', action: 'BLOCK' },
          { type: 'PHONE', action: 'BLOCK' },
          { type: 'PASSWORD', action: 'BLOCK' },
          { type: 'NAME', action: 'ANONYMIZE' },
          { type: 'AGE', action: 'ANONYMIZE' },
          { type: 'USERNAME', action: 'ANONYMIZE' },
        ],
      },
    });

    apiInstanceRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'BedrockGuardrails',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:ApplyGuardrail'],
        // Scoped to the specific guardrail created above.
        resources: [guardrail.attrGuardrailArn],
      }),
    );

    // =========================================================================
    // 7. Compute for the Rails API — Lambda (container image) + Function URL.
    // =========================================================================
    // App Runner was the original design choice, but it is blocked by SCP in the
    // target accounts, so compute is a scale-to-zero Lambda instead. This is
    // cheaper (true $0 idle, no always-on memory bill, no ALB) and still NAT-free:
    //  - Managed egress reaches Bedrock / Secrets Manager (no VPC attachment).
    //  - Aurora is reached via the Data API over HTTPS.
    //  - A Function URL provides the public HTTPS endpoint the SPA/clients call.
    // arm64 (Graviton) is ~20% cheaper and faster per the same memory.
    const apiFunction = new lambda.DockerImageFunction(this, 'ApiFunction', {
      functionName: 'codeai-rails-api',
      role: apiInstanceRole,
      // x86_64 to match the build host (arm64 cross-build hit "exec format
      // error" during npm install). Still cheap + scale-to-zero.
      architecture: lambda.Architecture.X86_64,
      // 512 MB balances Rails cold-start CPU against cost; tune via context.
      memorySize: props.apiMemoryMb,
      timeout: cdk.Duration.seconds(30),
      // The Function URL is public and has no rate limiting, so cap concurrency to
      // bound Bedrock cost and abuse. 10 is plenty for a classroom demo.
      reservedConcurrentExecutions: 10,
      // The Rails API image (api/Dockerfile, Lamby handler app.handler). Built
      // for linux/amd64 so it matches the function architecture on any host.
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../api'), {
        platform: Platform.LINUX_AMD64,
      }),
      environment: {
        DB_DRIVER: 'data_api',
        DB_CLUSTER_ARN: dbCluster.clusterArn,
        DB_SECRET_ARN: dbCluster.secret?.secretArn ?? '',
        DB_NAME: 'codeai',
        ARTIFACTS_BUCKET: artifactsBucket.bucketName,
        BEDROCK_MODEL_ID: props.bedrockModelId,
        GUARDRAIL_ID: guardrail.attrGuardrailId,
        GUARDRAIL_VERSION: 'DRAFT',
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
        // demo = synthetic users picked via X-Demo-User header (no passwords;
        // every tile is one tap). cognito = real password sign-in.
        // Default is 'demo' for the hackathon demo; switch to real auth with
        // -c codeai:authMode=cognito. Synthetic data only in demo mode (NFR2).
        AUTH_MODE: (this.node.tryGetContext('codeai:authMode') as string | undefined) ?? 'demo',
        // Fault injection + demo reset for teachers (M6 demo). Set to 'false' for real classes.
        DEMO_CONTROLS: 'true',
        VALIDATION_MODE: 'model',
        // AI picks among rule-approved candidates; the Demo menu can switch to 'rules'.
        ROUTING_MODE: 'advised',
        ALLOWED_ORIGINS: `https://${distribution.distributionDomainName},http://localhost:5173`,
      },
    });

    // Public HTTPS endpoint. AuthN is handled by the app (Cognito JWT), so the
    // URL auth type is NONE; the function itself enforces the JWT + row scoping.
    const apiFunctionUrl = apiFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      // No Function URL CORS: Rails rack-cors (driven by ALLOWED_ORIGINS) owns
      // CORS. Configuring both sends duplicate Access-Control-Allow-Origin
      // headers, which browsers reject.
    });
    // NOTE: The SPA build is deployed to spaBucket by CI (web -> build -> S3 ->
    // CloudFront invalidate), not by this stack. The bucket + distribution are
    // provisioned here; content upload is a deploy-time step (see README).

    // =========================================================================
    // 8. GitHub OIDC provider + least-privilege deploy role.
    //    Trust is scoped to a single repo + the main branch ref.
    // =========================================================================
    const githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const subjectClaim = `repo:${props.githubRepo}:ref:refs/heads/${props.githubBranch}`;
    // GitHub's newer sub format embeds numeric ids: repo:Owner@<id>/Repo@<id>:ref:...
    // (seen in CloudTrail for this repo). Accept it alongside the legacy form; the
    // owner and repo names are still pinned, only the id suffix is wildcarded.
    const [ghOwner, ghRepo] = props.githubRepo.split('/');
    const subjectClaimWithIds = `repo:${ghOwner}@*/${ghRepo}@*:ref:refs/heads/${props.githubBranch}`;

    const deployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'codeai-github-deploy',
      description:
        'Assumed by GitHub Actions via OIDC. Trust scoped to ' + subjectClaim,
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.OpenIdConnectPrincipal(githubOidcProvider, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': [subjectClaim, subjectClaimWithIds],
        },
      }),
    });

    // Least-privilege deploy permissions: CDK CloudFormation deploys, ECR push,
    // S3 sync to the SPA bucket, CloudFront invalidation, and App Runner trigger.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CdkDeployViaCloudFormation',
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudformation:CreateStack',
          'cloudformation:UpdateStack',
          'cloudformation:DeleteStack',
          'cloudformation:DescribeStacks',
          'cloudformation:DescribeStackEvents',
          'cloudformation:DescribeStackResources',
          'cloudformation:GetTemplate',
          'cloudformation:ValidateTemplate',
          'cloudformation:ExecuteChangeSet',
          'cloudformation:CreateChangeSet',
          'cloudformation:DescribeChangeSet',
          'cloudformation:DeleteChangeSet',
        ],
        resources: [
          `arn:${this.partition}:cloudformation:${this.region}:${this.account}:stack/${this.stackName}/*`,
          `arn:${this.partition}:cloudformation:${this.region}:${this.account}:stack/CDKToolkit/*`,
        ],
      }),
    );

    // Assume the CDK bootstrap roles (file publishing + deploy). This is how the
    // modern CDK deploy flow works without granting broad service permissions.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AssumeCdkBootstrapRoles',
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:${this.partition}:iam::${this.account}:role/cdk-*-deploy-role-${this.account}-${this.region}`,
          `arn:${this.partition}:iam::${this.account}:role/cdk-*-file-publishing-role-${this.account}-${this.region}`,
          `arn:${this.partition}:iam::${this.account}:role/cdk-*-image-publishing-role-${this.account}-${this.region}`,
          `arn:${this.partition}:iam::${this.account}:role/cdk-*-lookup-role-${this.account}-${this.region}`,
        ],
      }),
    );

    // Push the Rails image to ECR.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'EcrPush',
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
          'ecr:PutImage',
          'ecr:BatchGetImage',
          'ecr:GetDownloadUrlForLayer',
        ],
        resources: ['*'], // GetAuthorizationToken requires * ; others resource-scoped by ECR policy.
      }),
    );

    // Deploy the SPA build to the private bucket + invalidate CloudFront.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SpaDeploy',
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject', 's3:DeleteObject', 's3:ListBucket', 's3:GetObject'],
        resources: [spaBucket.bucketArn, `${spaBucket.bucketArn}/*`],
      }),
    );
    dataKey.grantEncryptDecrypt(deployRole); // SSE-KMS writes to the SPA bucket.

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudFrontInvalidate',
        effect: iam.Effect.ALLOW,
        actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
        resources: [
          `arn:${this.partition}:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
        ],
      }),
    );

    // Update the API Lambda's image after pushing a new container to ECR.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'LambdaDeploy',
        effect: iam.Effect.ALLOW,
        actions: [
          'lambda:UpdateFunctionCode',
          'lambda:GetFunction',
          'lambda:UpdateFunctionConfiguration',
        ],
        resources: [apiFunction.functionArn],
      }),
    );

    // =========================================================================
    // 9. Outputs
    // =========================================================================
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, 'AuroraClusterArn', { value: dbCluster.clusterArn });
    new cdk.CfnOutput(this, 'AuroraSecretArn', {
      value: dbCluster.secret?.secretArn ?? 'n/a',
    });
    new cdk.CfnOutput(this, 'SpaBucketName', { value: spaBucket.bucketName });
    new cdk.CfnOutput(this, 'ArtifactsBucketName', {
      value: artifactsBucket.bucketName,
    });
    new cdk.CfnOutput(this, 'CloudFrontDomain', {
      value: distribution.distributionDomainName,
    });
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
    });
    new cdk.CfnOutput(this, 'ApiFunctionName', {
      value: apiFunction.functionName,
    });
    new cdk.CfnOutput(this, 'ApiFunctionUrl', {
      value: apiFunctionUrl.url,
    });
    new cdk.CfnOutput(this, 'GitHubDeployRoleArn', { value: deployRole.roleArn });
    new cdk.CfnOutput(this, 'KmsKeyArn', { value: dataKey.keyArn });
    // ---------------------------------------------------------------------------
    // Bit tutor agent on Amazon Bedrock AgentCore Runtime (agent/).
    // A Strands agent with 3 curriculum tools, ARM64 container, HTTP protocol.
    // Inbound auth: Cognito JWT (access tokens from the web app client); a call
    // without a valid token is rejected by the runtime. ADOT tracing on.
    // ---------------------------------------------------------------------------
    const agentImage = new DockerImageAsset(this, 'BitAgentImage', {
      directory: path.join(__dirname, '../..'),
      file: 'agent/Dockerfile',
      platform: Platform.LINUX_ARM64,
      ignoreMode: IgnoreMode.DOCKER,
      // Build context is the repo root; ship only the agent and the curriculum YAML.
      exclude: ['*', '!agent', '!api', 'api/*', '!api/config', 'api/config/*', '!api/config/curriculum'],
    });

    const agentRuntimeName = 'codeai_bit_tutor';
    const agentRole = new iam.Role(this, 'BitAgentRole', {
      description: 'Execution role for the Bit tutor agent on AgentCore Runtime',
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com', {
        // Confused-deputy protection.
        conditions: {
          StringEquals: { 'aws:SourceAccount': this.account },
          ArnLike: { 'aws:SourceArn': `arn:aws:bedrock-agentcore:${this.region}:${this.account}:*` },
        },
      }),
    });
    agentImage.repository.grantPull(agentRole);
    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams'],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/runtimes/*`],
      }),
    );
    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:DescribeLogGroups'],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:*`],
      }),
    );
    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords', 'xray:GetSamplingRules', 'xray:GetSamplingTargets'],
        resources: ['*'],
      }),
    );
    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: { StringEquals: { 'cloudwatch:namespace': 'bedrock-agentcore' } },
      }),
    );
    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          'arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`,
        ],
      }),
    );
    agentRole.addToPolicy(
      new iam.PolicyStatement({ actions: ['bedrock:ApplyGuardrail'], resources: [guardrail.attrGuardrailArn] }),
    );
    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock-agentcore:GetWorkloadAccessToken', 'bedrock-agentcore:GetWorkloadAccessTokenForJWT'],
        resources: [
          `arn:aws:bedrock-agentcore:${this.region}:${this.account}:workload-identity-directory/default`,
          `arn:aws:bedrock-agentcore:${this.region}:${this.account}:workload-identity-directory/default/workload-identity/${agentRuntimeName}-*`,
        ],
      }),
    );

    const bitAgent = new agentcore.CfnRuntime(this, 'BitAgentRuntime', {
      agentRuntimeName,
      description: 'Bit, the CodeAI lesson tutor (Strands agent with curriculum tools)',
      agentRuntimeArtifact: { containerConfiguration: { containerUri: agentImage.imageUri } },
      roleArn: agentRole.roleArn,
      networkConfiguration: { networkMode: 'PUBLIC' },
      protocolConfiguration: 'HTTP',
      authorizerConfiguration: {
        customJwtAuthorizer: {
          discoveryUrl: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}/.well-known/openid-configuration`,
          allowedClients: [userPoolClient.userPoolClientId],
        },
      },
      environmentVariables: {
        BEDROCK_MODEL_ID: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        GUARDRAIL_ID: guardrail.attrGuardrailId,
        GUARDRAIL_VERSION: 'DRAFT',
      },
    });
    bitAgent.node.addDependency(agentRole);

    // The API's "Ask Bit" calls this agent with the student's own Cognito access token
    // (JWT inbound auth; no IAM permission needed), falling back to direct Bedrock.
    if (databaseSchema) apiFunction.node.addDependency(databaseSchema);
    apiFunction.addEnvironment('BIT_AGENT_ARN', bitAgent.attrAgentRuntimeArn);
    new cdk.CfnOutput(this, 'BitAgentRuntimeArn', { value: bitAgent.attrAgentRuntimeArn });

    new cdk.CfnOutput(this, 'GuardrailId', { value: guardrail.attrGuardrailId });
    new cdk.CfnOutput(this, 'GuardrailArn', {
      value: guardrail.attrGuardrailArn,
    });
  }
}
