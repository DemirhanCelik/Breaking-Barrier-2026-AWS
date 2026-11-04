#!/usr/bin/env bash
# Calls the Bit tutor agent on AgentCore Runtime, proving inbound OAuth:
#   1. a call WITHOUT a token is rejected by AgentCore Identity (JWT authorizer)
#   2. a call WITH a Cognito access token gets an answer (the agent uses its tools)
#
#   DEMO_PASSWORD='...' scripts/invoke-bit-agent.sh ["What should I put in my prompt?"] [L6]
#
# Signs in as the demo student ava@demo.test (synthetic account) to get an access token.
set -euo pipefail
REGION=${AWS_REGION:-us-east-1}
STACK=CodeAiAdaptiveEngineMvp
PROMPT=${1:-"I'm stuck on writing my prompt. What should I think about?"}
LEVEL=${2:-L6}
out() { aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
ARN=$(out BitAgentRuntimeArn); CLIENT=$(out UserPoolClientId)
ENC=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$ARN")
URL="https://bedrock-agentcore.$REGION.amazonaws.com/runtimes/$ENC/invocations?qualifier=DEFAULT"
SESSION="demo-session-$(date +%s)-$(python3 -c 'import uuid; print(uuid.uuid4().hex)')"
BODY=$(python3 -c 'import json, sys; print(json.dumps({"prompt": sys.argv[1], "level": sys.argv[2]}))' "$PROMPT" "$LEVEL")

echo "== 1. No token (must be rejected)"
curl -s -o /dev/stderr -w "HTTP %{http_code}\n" -X POST "$URL" -H 'Content-Type: application/json' \
  -H "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id: $SESSION" -d "$BODY" 2>&1 | tail -c 400; echo

: "${DEMO_PASSWORD:?Set DEMO_PASSWORD to sign in as the demo student}"
TOKEN=$(aws cognito-idp initiate-auth --region "$REGION" --client-id "$CLIENT" --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters "USERNAME=ava@demo.test,PASSWORD=$DEMO_PASSWORD" \
  --query AuthenticationResult.AccessToken --output text)

echo "== 2. With a Cognito access token"
curl -s -X POST "$URL" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -H "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id: $SESSION" -d "$BODY" | python3 -m json.tool
