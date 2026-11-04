#!/usr/bin/env bash
# One-time, account-level: turn on CloudWatch Transaction Search so AgentCore
# Observability can show end-to-end agent traces (request -> model -> tool calls).
# Lets X-Ray write spans to CloudWatch Logs (aws/spans) and indexes 100% of spans
# for the demo (lower it later; indexing above 1% is billed).
set -euo pipefail
REGION=${AWS_REGION:-us-east-1}
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
POLICY=$(cat <<JSON
{"Version":"2012-10-17","Statement":[{"Sid":"TransactionSearchXRayAccess","Effect":"Allow",
 "Principal":{"Service":"xray.amazonaws.com"},"Action":"logs:PutLogEvents",
 "Resource":["arn:aws:logs:$REGION:$ACCOUNT:log-group:aws/spans:*","arn:aws:logs:$REGION:$ACCOUNT:log-group:/aws/application-signals/data:*"],
 "Condition":{"ArnLike":{"aws:SourceArn":"arn:aws:xray:$REGION:$ACCOUNT:*"},"StringEquals":{"aws:SourceAccount":"$ACCOUNT"}}}]}
JSON
)
aws logs put-resource-policy --region "$REGION" --policy-name TransactionSearchAccess --policy-document "$POLICY" >/dev/null
aws xray update-trace-segment-destination --region "$REGION" --destination CloudWatchLogs >/dev/null
aws xray update-indexing-rule --region "$REGION" --name Default --rule '{"Probabilistic":{"DesiredSamplingPercentage":100}}' >/dev/null
aws xray get-trace-segment-destination --region "$REGION"
