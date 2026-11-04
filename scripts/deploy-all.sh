#!/usr/bin/env bash
# End-to-end deploy: infra (with the Rails API image) -> DB schema + demo seed
# -> SPA build -> S3 sync -> CloudFront invalidation -> smoke test.
# Needs: AWS credentials for the target account, Docker running, Node 20.19+.
set -euo pipefail

STACK=CodeAiAdaptiveEngineMvp
REGION=${AWS_REGION:-us-east-1}
ROOT=$(cd "$(dirname "$0")/.." && pwd)

out() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

echo "==> 1/5 cdk deploy (builds api/ image for linux/amd64)"
(cd "$ROOT/infra" && npm ci --silent && npx cdk deploy --require-approval never)

FN=$(out ApiFunctionName)
API_URL=$(out ApiFunctionUrl); API_URL=${API_URL%/}
BUCKET=$(out SpaBucketName)
DIST=$(out CloudFrontDistributionId)
DOMAIN=$(out CloudFrontDomain)
CLIENT_ID=$(out UserPoolClientId)

echo "==> 2/5 create tables + demo data (Aurora may take ~30s to resume)"
for i in 1 2 3; do
  if aws lambda invoke --region "$REGION" --function-name "$FN" \
      --cli-binary-format raw-in-base64-out --cli-read-timeout 60 \
      --payload '{"codeai_task":"db:setup"}' /tmp/codeai-dbsetup.json >/dev/null \
     && grep -q '"ok":true' /tmp/codeai-dbsetup.json; then
    cat /tmp/codeai-dbsetup.json; echo; break
  fi
  echo "db:setup attempt $i failed: $(cat /tmp/codeai-dbsetup.json 2>/dev/null)"; sleep 15
  [ "$i" = 3 ] && { echo "db:setup failed; check CloudWatch logs for $FN"; exit 1; }
done

echo "==> 3/5 build SPA against $API_URL"
(cd "$ROOT/web" && npm ci --silent && \
  VITE_API_MODE=http VITE_API_URL="$API_URL" VITE_DEMO_CONTROLS=true \
  VITE_AUTH_MODE=cognito VITE_COGNITO_REGION="$REGION" VITE_COGNITO_CLIENT_ID="$CLIENT_ID" \
  VITE_DEMO_PASSWORD="${DEMO_PASSWORD:-}" npm run build)

echo "==> 4/5 upload SPA + invalidate CloudFront"
aws s3 sync "$ROOT/web/dist" "s3://$BUCKET" --delete --region "$REGION"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/*' \
  --query Invalidation.Id --output text

echo "==> 5/5 smoke test"
curl -s -m 60 "$API_URL/health"; echo
curl -s -m 30 -o /dev/null -w "session without token -> %{http_code} (expect 401)\n" "$API_URL/api/session"
curl -s -m 30 -o /dev/null -w "SPA https://$DOMAIN -> %{http_code}\n" "https://$DOMAIN/"
echo "Done. Open https://$DOMAIN"
