#!/usr/bin/env bash
# Runs the M5 validation benchmark (api/benchmark/submissions.yml) in Docker.
#
#   scripts/run-benchmark.sh            # probes + Bedrock rubric eval (needs `aws login`)
#   scripts/run-benchmark.sh probes     # deterministic probes only, no AWS calls
#
# Model mode passes your current AWS session to the container through
# environment variables only (nothing is written to disk). It makes one
# Bedrock call per item (~80 Haiku calls, a few cents).
set -euo pipefail
MODE=${1:-model}
cd "$(dirname "$0")/../api"

ENV_ARGS=(-e VALIDATION_MODE="$MODE" -e AWS_REGION=us-east-1 -e BEDROCK_REGION=us-east-1)
if [ "$MODE" = "model" ]; then
  eval "$(aws configure export-credentials --format env)"
  ENV_ARGS+=(-e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN)
  ENV_ARGS+=(-e BEDROCK_MODEL_ID="${BEDROCK_MODEL_ID:-us.anthropic.claude-haiku-4-5-20251001-v1:0}")
fi

docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e BUNDLE_PATH=/w/vendor/bundle \
  "${ENV_ARGS[@]}" -v "$PWD":/w -w /w ruby:3.3 \
  sh -c 'bundle install --quiet && bundle exec rake benchmark:run'
