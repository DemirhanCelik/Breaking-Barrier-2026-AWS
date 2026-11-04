#!/usr/bin/env bash
# Creates (or resets) the synthetic demo accounts in the Cognito user pool.
#
#   DEMO_PASSWORD='...' scripts/seed-cognito-demo.sh
#
# DEMO_PASSWORD is the shared password of the demo accounts. It ships in the SPA
# bundle (VITE_DEMO_PASSWORD) for one-click demo sign-in, so treat it as public:
# never reuse a real password. Pool policy: 8+ chars with upper, lower and a digit.
#
# Each user's preferred_username is the seeded app_user id (api demo_seed.rb), which
# links the Cognito user to that row on first sign-in. Emails use the reserved
# .test TLD (<name>@demo.test) and invitations are suppressed, so no email is ever sent.
# Keep the list in sync with web/src/auth/demoAccounts.ts.
set -euo pipefail

: "${DEMO_PASSWORD:?Set DEMO_PASSWORD (8+ chars with upper, lower and a digit)}"
REGION=${AWS_REGION:-us-east-1}
STACK=CodeAiAdaptiveEngineMvp
POOL=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)

ACCOUNTS="t-rivera:teacher s-hithesh:student s-tanushree:student s-demirhan:student s-tzuhan:student s-hithesh1:student s-tanushree1:student s-demirhan1:student s-tzuhan1:student"

for entry in $ACCOUNTS; do
  id=${entry%%:*}; group=${entry##*:}; email="${id#?-}@demo.test"
  if ! aws cognito-idp admin-get-user --region "$REGION" --user-pool-id "$POOL" --username "$email" >/dev/null 2>&1; then
    aws cognito-idp admin-create-user --region "$REGION" --user-pool-id "$POOL" --username "$email" \
      --message-action SUPPRESS \
      --user-attributes Name=email,Value="$email" Name=email_verified,Value=true Name=preferred_username,Value="$id" \
      >/dev/null
  else
    aws cognito-idp admin-update-user-attributes --region "$REGION" --user-pool-id "$POOL" --username "$email" \
      --user-attributes Name=preferred_username,Value="$id" >/dev/null
  fi
  aws cognito-idp admin-set-user-password --region "$REGION" --user-pool-id "$POOL" --username "$email" \
    --password "$DEMO_PASSWORD" --permanent
  aws cognito-idp admin-add-user-to-group --region "$REGION" --user-pool-id "$POOL" --username "$email" \
    --group-name "$group"
  echo "ok  $email ($group)"
done
echo "Done. Set the GitHub repo variable DEMO_PASSWORD to the same value, then re-run the deploy workflow."
