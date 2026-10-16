#!/usr/bin/env bash
# Sets which email(s) may sign in. Takes effect in about a minute, no full redeploy needed.
#   bash scripts/allow-email.sh you@example.com
#   bash scripts/allow-email.sh you@example.com,partner@example.com
set -euo pipefail
PROJECT_ID="${PROJECT_ID:-mahisys-command-center}"
REGION="${REGION:-asia-south1}"
SERVICE="command-center"
cd "$(dirname "$0")/.."
EMAILS="$(echo "${1:-}" | tr -d ' ' | tr 'A-Z' 'a-z')"
[ -n "$EMAILS" ] || { echo "Usage: bash scripts/allow-email.sh you@example.com[,other@example.com]"; exit 1; }
BUCKET="gs://${PROJECT_ID}-tfstate"
TFVARS="infra/terraform.tfvars"

# 1. Remember it for future deploys (local copy and the copy Cloud Build reads).
[ -f "$TFVARS" ] || gcloud storage cp -q "$BUCKET/terraform.tfvars" "$TFVARS"
sed -i "s|^allowed_emails.*|allowed_emails  = \"$EMAILS\"|" "$TFVARS"
gcloud storage cp -q "$TFVARS" "$BUCKET/terraform.tfvars"

# 2. Apply it to the running app now.
gcloud run services update "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --update-env-vars "^@^ALLOWED_EMAILS=$EMAILS" --quiet >/dev/null
echo "✓ Allowed to sign in: $EMAILS"
echo "  Open the app and sign in again."
