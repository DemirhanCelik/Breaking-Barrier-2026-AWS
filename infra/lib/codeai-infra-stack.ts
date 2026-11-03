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
import * as apprunner from 'aws-cdk-lib/aws-apprunner';

export interface CodeAiInfraStackProps extends cdk.StackProps {
  /** GitHub repo in "owner/name" form used to scope the OIDC trust policy. */
  readonly githubRepo: string;
  /** Branch allowed to assume the deploy role (e.g. "main"). */
  readonly githubBranch: string;
  /** Bedrock model id the API is permitted to invoke. */
  readonly bedrockModelId: string;
}

/**
 * Single-stack MVP infrastructure for the CodeAI Adaptive Learning Engine.
 *
 * Budget/security constraints enforced here:
 *  - NO NAT GATEWAYS. Aurora uses the Data API (HTTP over the AWS network), and
 *    App Runner runs in default egress mode, so neither needs a NAT path.
 *  - Everything smallest/cheapest tier; Aurora Serverless v2 scales to zero.
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
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // MVP.
    });

    const userPoolClient = userPool.addClient('WebClient', {
      userPoolClientName: 'codeai-web-spa',
      generateSecret: false, // public SPA (PKCE) client — no client secret.
      authFlows: { userSrp: true },
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
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
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
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      description: 'Runtime role for the Rails API on App Runner (least privilege).',
    });

    // 6a. Aurora Data API (execute statements against the cluster).
    dbCluster.grantDataApiAccess(apiInstanceRole);

    // 6b. Read ONLY the generated DB credentials secret (KMS decrypt included).
    dbCluster.secret?.grantRead(apiInstanceRole);

    // 6c. Artifacts bucket: object-level read/write for presigned URL issuance.
    artifactsBucket.grantReadWrite(apiInstanceRole);
    dataKey.grantEncryptDecrypt(apiInstanceRole); // for SSE-KMS object access.

    // 6d. Bedrock: invoke the configured model + apply Guardrails. Scoped to
    //     this region/account and foundation models; not a blanket bedrock:*.
    const bedrockModelArn = cdk.Arn.format(
      {
        service: 'bedrock',
        region: this.region,
        account: '', // foundation-model ARNs have no account segment.
        resource: 'foundation-model',
        resourceName: props.bedrockModelId,
        arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
      },
      this,
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
          bedrockModelArn,
          // Inference-profile ARNs (cross-region profiles) for the same account.
          `arn:${this.partition}:bedrock:${this.region}:${this.account}:inference-profile/*`,
        ],
      }),
    );

    apiInstanceRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'BedrockGuardrails',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:ApplyGuardrail'],
        resources: [
          `arn:${this.partition}:bedrock:${this.region}:${this.account}:guardrail/*`,
        ],
      }),
    );

    // =========================================================================
    // 7. App Runner — smallest size (0.25 vCPU / 0.5 GB). Default egress (no NAT).
    // =========================================================================
    // Build-time access role to pull the container image from ECR.
    const apiAccessRole = new iam.Role(this, 'ApiAccessRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      description: 'App Runner ECR access role.',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSAppRunnerServicePolicyForECRAccess',
        ),
      ],
    });

    const apiService = new apprunner.CfnService(this, 'ApiService', {
      serviceName: 'codeai-rails-api',
      instanceConfiguration: {
        // Smallest App Runner size.
        cpu: '0.25 vCPU',
        memory: '0.5 GB',
        instanceRoleArn: apiInstanceRole.roleArn,
      },
      sourceConfiguration: {
        autoDeploymentsEnabled: false,
        authenticationConfiguration: {
          accessRoleArn: apiAccessRole.roleArn,
        },
        imageRepository: {
          // Placeholder public image so `cdk synth` is valid before the Rails
          // image exists. Swap to your private ECR image at deploy time.
          imageIdentifier: 'public.ecr.aws/aws-containers/hello-app-runner:latest',
          imageRepositoryType: 'ECR_PUBLIC',
          imageConfiguration: {
            port: '8080',
            runtimeEnvironmentVariables: [
              { name: 'AWS_REGION', value: this.region },
              { name: 'DB_CLUSTER_ARN', value: dbCluster.clusterArn },
              { name: 'DB_SECRET_ARN', value: dbCluster.secret?.secretArn ?? '' },
              { name: 'DB_NAME', value: 'codeai' },
              { name: 'ARTIFACTS_BUCKET', value: artifactsBucket.bucketName },
              { name: 'BEDROCK_MODEL_ID', value: props.bedrockModelId },
              { name: 'COGNITO_USER_POOL_ID', value: userPool.userPoolId },
              { name: 'COGNITO_CLIENT_ID', value: userPoolClient.userPoolClientId },
            ],
          },
        },
      },
      healthCheckConfiguration: {
        protocol: 'TCP',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
    });
    apiService.node.addDependency(apiInstanceRole);
    apiService.node.addDependency(apiAccessRole);

    // =========================================================================
    // 8. GitHub OIDC provider + least-privilege deploy role.
    //    Trust is scoped to a single repo + the main branch ref.
    // =========================================================================
    const githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const subjectClaim = `repo:${props.githubRepo}:ref:refs/heads/${props.githubBranch}`;

    const deployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'codeai-github-deploy',
      description:
        'Assumed by GitHub Actions via OIDC. Trust scoped to ' + subjectClaim,
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.OpenIdConnectPrincipal(githubOidcProvider, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': subjectClaim,
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

    // Trigger an App Runner deployment after pushing a new image.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AppRunnerDeploy',
        effect: iam.Effect.ALLOW,
        actions: [
          'apprunner:StartDeployment',
          'apprunner:DescribeService',
          'apprunner:ListOperations',
        ],
        resources: [apiService.attrServiceArn],
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
    new cdk.CfnOutput(this, 'ApiServiceArn', { value: apiService.attrServiceArn });
    new cdk.CfnOutput(this, 'ApiServiceUrl', {
      value: apiService.attrServiceUrl,
    });
    new cdk.CfnOutput(this, 'GitHubDeployRoleArn', { value: deployRole.roleArn });
    new cdk.CfnOutput(this, 'KmsKeyArn', { value: dataKey.keyArn });
  }
}
