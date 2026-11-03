#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CodeAiInfraStack } from '../lib/codeai-infra-stack';

const app = new cdk.App();

/**
 * All environment-specific values are parameterized via CDK context so nothing
 * is hardcoded. Override on the CLI with, e.g.:
 *   cdk synth -c codeai:accountId=123456789012 -c codeai:region=us-east-1
 * or edit the defaults in cdk.json.
 *
 * Fallback order: CLI/cdk.json context -> CDK_DEFAULT_* env -> placeholder.
 * A placeholder account still lets `cdk synth` run cleanly; a real account id
 * is only required for `cdk bootstrap` / `cdk deploy`.
 */
const accountId =
  (app.node.tryGetContext('codeai:accountId') as string | undefined) ??
  process.env.CDK_DEFAULT_ACCOUNT ??
  'REPLACE_WITH_ACCOUNT_ID';

const region =
  (app.node.tryGetContext('codeai:region') as string | undefined) ??
  process.env.CDK_DEFAULT_REGION ??
  'us-east-1';

const githubRepo =
  (app.node.tryGetContext('codeai:githubRepo') as string | undefined) ??
  'DemirhanCelik/Breaking-Barrier-2026-AWS';

const githubBranch =
  (app.node.tryGetContext('codeai:githubBranch') as string | undefined) ?? 'main';

const bedrockModelId =
  (app.node.tryGetContext('codeai:bedrockModelId') as string | undefined) ??
  'us.anthropic.claude-haiku-4-5-20251001-v1:0';

const apiMemoryMb = Number(
  (app.node.tryGetContext('codeai:apiMemoryMb') as string | undefined) ?? 512,
);

new CodeAiInfraStack(app, 'CodeAiAdaptiveEngineMvp', {
  env: { account: accountId, region },
  githubRepo,
  githubBranch,
  bedrockModelId,
  apiMemoryMb,
  description:
    'CodeAI Adaptive Learning Engine MVP — Cognito, Aurora Serverless v2 (Data API), ' +
    'private S3 + CloudFront OAC, API Lambda + Function URL, GitHub OIDC deploy role, Bedrock access. No NAT gateways.',
  tags: {
    Project: 'CodeAI-Adaptive-Learning-Engine',
    Environment: 'mvp',
    ManagedBy: 'cdk',
  },
});

app.synth();
