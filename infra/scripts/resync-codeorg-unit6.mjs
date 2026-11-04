#!/usr/bin/env node
// @ts-nocheck
/**
 * On-demand re-sync of the code.org "AI-Generated Design" (Unit 6) curriculum
 * into the CodeAI Bedrock Knowledge Base.
 *
 * What it does (same flow that was run by hand the first time):
 *   1. Fetch the unit's `script_json` from the code-dot-org GitHub repo.
 *   2. Transform it into clean markdown docs (one per lesson + a unit overview
 *      with resources, objectives, learning goals, evidence levels).
 *   3. Upload them to the KB source bucket under the unit6 inclusion prefix
 *      (SSE-KMS), removing any stale objects first so deletions propagate.
 *   4. Start a Bedrock ingestion job on the unit6 data source and poll it to
 *      completion.
 *
 * Requirements: Node 18+ (global fetch) and the AWS CLI v2 on PATH, with
 * credentials for the target account/region. No npm dependencies.
 *
 * Account portability: the KB id, unit6 data-source id, source bucket, and KMS
 * key are NOT hardcoded. By default they are read from the deployed stack's
 * CloudFormation outputs, so this runs unchanged in any account that deployed
 * the CDK stack. (Explicit env vars still override the lookup.)
 *
 * Usage:
 *   # resolve everything from the deployed stack (default stack name):
 *   node infra/scripts/resync-codeorg-unit6.mjs
 *
 *   # a differently-named stack / region:
 *   node infra/scripts/resync-codeorg-unit6.mjs --stack MyStack --region us-east-1
 *
 *   # fully explicit (no CloudFormation lookup needed):
 *   KNOWLEDGE_BASE_ID=... UNIT6_DATA_SOURCE_ID=... KB_BUCKET=... KB_KMS_KEY_ARN=... \
 *     node infra/scripts/resync-codeorg-unit6.mjs
 *
 * Resolution order for each value: explicit env var -> CloudFormation stack
 * output -> (for region/prefix/course) a safe default. If a required value
 * can't be resolved, the script fails with a clear message rather than
 * silently targeting the wrong account.
 *
 * Config via env / flags:
 *   --stack / KB_STACK         CloudFormation stack to read outputs from
 *                              (default: CodeAiAdaptiveEngineMvp)
 *   --region / KB_REGION       the KB's region (default us-east-1). Note: this
 *                              is deliberately NOT the ambient AWS_REGION, which
 *                              often points elsewhere and would 404 the KB.
 *   KNOWLEDGE_BASE_ID          overrides stack output KnowledgeBaseId
 *   UNIT6_DATA_SOURCE_ID       overrides stack output KnowledgeBaseUnit6DataSourceId
 *   KB_BUCKET                  overrides stack output ArtifactsBucketName
 *   KB_KMS_KEY_ARN             overrides stack output KmsKeyArn
 *   KB_PREFIX                  default kb-source-codeorg-unit6/
 *   COURSE_SCRIPT              default ai-generated-design-2026 (Unit 6 script name)
 *   GIT_REF                    default staging
 *   DRY_RUN=1                  build docs locally; skip S3 + ingestion
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Minimal `--flag value` parser (only the flags this script accepts). */
function flag(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

// Values known up front (no AWS call needed). Account-specific values (KB id,
// data-source id, bucket, KMS key) are resolved later from CloudFormation
// outputs unless given explicitly via env — see resolveFromStack().
const cfg = {
  // The KB's region. Deliberately NOT the ambient AWS_REGION (which often
  // points elsewhere and would make calls 404 the KB). Override via --region
  // or KB_REGION only.
  region: flag('region') || process.env.KB_REGION || 'us-east-1',
  stack: flag('stack') || process.env.KB_STACK || 'CodeAiAdaptiveEngineMvp',
  kbId: process.env.KNOWLEDGE_BASE_ID,
  dataSourceId: process.env.UNIT6_DATA_SOURCE_ID,
  bucket: process.env.KB_BUCKET,
  kmsKeyArn: process.env.KB_KMS_KEY_ARN,
  prefix: process.env.KB_PREFIX || 'kb-source-codeorg-unit6/',
  courseScript: process.env.COURSE_SCRIPT || 'ai-generated-design-2026',
  gitRef: process.env.GIT_REF || 'staging',
  dryRun: process.env.DRY_RUN === '1',
};

const SCRIPT_JSON_URL = `https://raw.githubusercontent.com/code-dot-org/code-dot-org/${cfg.gitRef}/dashboard/config/scripts_json/${cfg.courseScript}.script_json`;

const log = (...a) => console.log('[resync]', ...a);

function aws(args, opts = {}) {
  return execFileSync('aws', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
    // Pin the region for every child process so an ambient AWS_REGION that
    // points at a different region can't redirect calls away from the KB.
    env: { ...process.env, AWS_REGION: cfg.region, AWS_DEFAULT_REGION: cfg.region },
  });
}

/**
 * Fill any of {kbId, dataSourceId, bucket, kmsKeyArn} not already set via env
 * from the deployed CDK stack's CloudFormation outputs. Explicit env values
 * always win; only the gaps are looked up. Throws a clear error if a required
 * value is still missing after the lookup.
 */
function resolveFromStack() {
  const need = !cfg.kbId || !cfg.dataSourceId || !cfg.bucket || !cfg.kmsKeyArn;
  if (!need) return;

  let outputs = [];
  try {
    const res = JSON.parse(
      aws([
        'cloudformation', 'describe-stacks',
        '--stack-name', cfg.stack,
        '--region', cfg.region,
        '--query', 'Stacks[0].Outputs',
        '--output', 'json',
      ]),
    );
    outputs = Array.isArray(res) ? res : [];
  } catch (e) {
    throw new Error(
      `Could not read CloudFormation outputs for stack "${cfg.stack}" in ${cfg.region}: ` +
        `${String(e.stderr || e.message || e).trim()}\n` +
        `Deploy the stack first (cdk deploy), pass --stack/--region, or set ` +
        `KNOWLEDGE_BASE_ID / UNIT6_DATA_SOURCE_ID / KB_BUCKET / KB_KMS_KEY_ARN explicitly.`,
    );
  }

  const byKey = Object.fromEntries(outputs.map((o) => [o.OutputKey, o.OutputValue]));
  cfg.kbId = cfg.kbId || byKey.KnowledgeBaseId;
  cfg.dataSourceId = cfg.dataSourceId || byKey.KnowledgeBaseUnit6DataSourceId;
  cfg.bucket = cfg.bucket || byKey.ArtifactsBucketName;
  cfg.kmsKeyArn = cfg.kmsKeyArn || byKey.KmsKeyArn;

  const missing = Object.entries({
    'KNOWLEDGE_BASE_ID (output KnowledgeBaseId)': cfg.kbId,
    'UNIT6_DATA_SOURCE_ID (output KnowledgeBaseUnit6DataSourceId)': cfg.dataSourceId,
    'KB_BUCKET (output ArtifactsBucketName)': cfg.bucket,
    'KB_KMS_KEY_ARN (output KmsKeyArn)': cfg.kmsKeyArn,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    throw new Error(
      `Stack "${cfg.stack}" did not provide: ${missing.join(', ')}.\n` +
        `Confirm the stack is deployed and exports these outputs, or set the ` +
        `corresponding env vars explicitly.`,
    );
  }
}

function slug(s) {
  return (
    String(s)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'untitled'
  );
}

/** Build the markdown docs from the parsed script_json. Returns {name: text}. */
function buildDocs(d) {
  const docs = {};
  const unitName = d?.script?.name || cfg.courseScript;
  const lessons = [...(d.lessons || [])].sort(
    (a, b) => (a.absolute_position || 0) - (b.absolute_position || 0),
  );

  for (const l of lessons) {
    const name = l.name || l.key;
    const pos = l.absolute_position;
    const p = l.properties || {};
    const parts = [
      `# ${name}`,
      ``,
      `Unit: AI-Generated Design (code.org AI Foundations Year 1, 2026) — Unit 6`,
      `Lesson position: ${pos}`,
    ];
    if (p.purpose) parts.push(``, `## Purpose`, ``, p.purpose);
    if (p.overview) parts.push(``, `## Overview`, ``, p.overview);
    if (p.student_overview)
      parts.push(``, `## Student Overview`, ``, p.student_overview);
    const fn = `lesson-${String(pos).padStart(2, '0')}-${slug(name)}.md`;
    docs[fn] = parts.join('\n').trim() + '\n';
  }

  // Unit overview + resources/objectives/goals.
  const ov = [
    `# Unit 6: AI-Generated Design — Overview and Resources`,
    ``,
    `code.org AI Foundations Year 1 (2026). Script: ${unitName}.`,
    ``,
    `This unit has ${lessons.length} lessons.`,
    ``,
    `## Lessons`,
    ``,
  ];
  for (const l of lessons) ov.push(`- ${l.absolute_position}. ${l.name}`);

  const seen = new Set();
  ov.push(``, `## Resources`, ``);
  for (const r of d.resources || []) {
    const key = `${r.name}|${r.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const props = r.properties || {};
    const cat = props.curriculum_category || '';
    const aud = props.audience || '';
    ov.push(`- ${r.name} (${aud}${cat ? '/' + cat : ''}): ${r.url}`);
  }

  const objs = (d.objectives || [])
    .map((o) => o.properties?.description)
    .filter(Boolean);
  if (objs.length) {
    ov.push(``, `## Objectives`, ``);
    for (const o of objs) ov.push(`- ${o}`);
  }

  const goals = (d.learning_goals || [])
    .map((g) => g.learning_goal)
    .filter(Boolean);
  if (goals.length) {
    ov.push(``, `## Learning Goals`, ``);
    for (const g of goals) ov.push(`- ${g}`);
  }

  const levels = (d.learning_goal_evidence_levels || []).filter(
    (e) => (e.teacher_description || '').trim(),
  );
  if (levels.length) {
    ov.push(``, `## Learning Goal Evidence Levels`, ``);
    for (const e of levels)
      ov.push(`- (understanding ${e.understanding}) ${e.teacher_description.trim()}`);
  }

  docs['unit-overview-and-resources.md'] = ov.join('\n').trim() + '\n';
  return docs;
}

async function main() {
  log(`fetching ${SCRIPT_JSON_URL}`);
  const res = await fetch(SCRIPT_JSON_URL);
  if (!res.ok) {
    throw new Error(`GitHub fetch failed: HTTP ${res.status} for ${SCRIPT_JSON_URL}`);
  }
  const data = JSON.parse(await res.text());
  if (!data?.script?.name) {
    throw new Error(
      'Unexpected script_json shape (no script.name). The site/repo path may have changed.',
    );
  }

  const docs = buildDocs(data);
  const names = Object.keys(docs).sort();
  const totalBytes = names.reduce((n, f) => n + Buffer.byteLength(docs[f]), 0);
  log(`built ${names.length} docs (${totalBytes} bytes)`);

  const workDir = mkdtempSync(join(tmpdir(), 'codeorg-unit6-'));
  for (const f of names) writeFileSync(join(workDir, f), docs[f], 'utf8');

  if (cfg.dryRun) {
    log(`DRY_RUN=1 — docs written to ${workDir}; skipping S3 + ingestion.`);
    log(names.map((n) => '  ' + n).join('\n'));
    return;
  }

  // Resolve account-specific targets from the deployed stack (unless all were
  // supplied via env). Only needed for the actual S3 + ingestion path.
  resolveFromStack();
  log(
    `target: kb=${cfg.kbId} dataSource=${cfg.dataSourceId} bucket=${cfg.bucket} region=${cfg.region}`,
  );

  // Upload with --delete so removed lessons disappear from the KB prefix too.
  const s3Uri = `s3://${cfg.bucket}/${cfg.prefix}`;
  log(`syncing -> ${s3Uri}`);
  aws([
    's3', 'sync', workDir + '/', s3Uri,
    '--delete',
    '--region', cfg.region,
    '--content-type', 'text/markdown',
    '--sse', 'aws:kms',
    '--sse-kms-key-id', cfg.kmsKeyArn,
  ], { stdio: ['ignore', 'inherit', 'inherit'] });
  rmSync(workDir, { recursive: true, force: true });

  // Start ingestion. The KB's vector store is Aurora Serverless v2, which may
  // be auto-paused (scaled to zero). While it resumes, Bedrock can transiently
  // report the store as unavailable OR surface a misleading
  // ResourceNotFoundException ("KnowledgeBase ... is not found") even though
  // the KB exists — so treat those as retryable, not fatal.
  log(`starting ingestion job (region ${cfg.region})...`);
  // Retryable while Aurora resumes: explicit pause message, store-unavailable,
  // and the misleading not-found that Bedrock throws when it can't reach RDS.
  const RETRYABLE =
    /resuming after being auto-paused|is not currently available|ResourceNotFoundException|is not found|storage configuration provided is invalid/i;
  let jobId;
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const out = JSON.parse(
        aws([
          'bedrock-agent', 'start-ingestion-job',
          '--knowledge-base-id', cfg.kbId,
          '--data-source-id', cfg.dataSourceId,
          '--description', 'On-demand re-sync of code.org Unit 6.',
          '--region', cfg.region,
          '--output', 'json',
        ]),
      );
      jobId = out.ingestionJob.ingestionJobId;
      break;
    } catch (e) {
      const msg = String(e.stderr || e.message || e);
      if (RETRYABLE.test(msg) && attempt < 8) {
        log(`  vector store resuming; retry ${attempt}/7 in 8s...`);
        await new Promise((r) => setTimeout(r, 8000));
        continue;
      }
      throw e;
    }
  }
  log(`ingestion job ${jobId} started; polling...`);

  // Poll to a terminal state.
  for (;;) {
    await new Promise((r) => setTimeout(r, 6000));
    const job = JSON.parse(
      aws([
        'bedrock-agent', 'get-ingestion-job',
        '--knowledge-base-id', cfg.kbId,
        '--data-source-id', cfg.dataSourceId,
        '--ingestion-job-id', jobId,
        '--region', cfg.region,
        '--output', 'json',
      ]),
    ).ingestionJob;
    const st = job.status;
    if (st === 'COMPLETE') {
      const s = job.statistics || {};
      log(
        `COMPLETE — scanned ${s.numberOfDocumentsScanned}, indexed ${
          (s.numberOfNewDocumentsIndexed || 0) + (s.numberOfModifiedDocumentsIndexed || 0)
        }, deleted ${s.numberOfDocumentsDeleted || 0}, failed ${s.numberOfDocumentsFailed || 0}`,
      );
      return;
    }
    if (st === 'FAILED') {
      throw new Error(`ingestion FAILED: ${JSON.stringify(job.failureReasons || [])}`);
    }
    log(`  status: ${st}`);
  }
}

main().catch((err) => {
  console.error('[resync] ERROR:', err.stderr ? String(err.stderr) : err.message || err);
  process.exit(1);
});
