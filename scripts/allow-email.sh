#!/usr/bin/env bash
# Sets which email(s) may sign in. Takes effect in about a minute, no redeploy needed.
#   bash scripts/allow-email.sh                      → allow every login that exists in Firebase
#   bash scripts/allow-email.sh you@example.com      → allow exactly these (comma-separated)
set -euo pipefail
PROJECT_ID="${PROJECT_ID:-mahisys-command-center}"
REGION="${REGION:-asia-south1}"
SERVICE="command-center"
cd "$(dirname "$0")/.."

firebase_emails() {
  curl -s -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: $PROJECT_ID" \
    -H "Content-Type: application/json" -d '{"returnUserInfo":true,"limit":"100"}' \
    "https://identitytoolkit.googleapis.com/v1/projects/$PROJECT_ID/accounts:query" \
    | python3 -c 'import json,sys
d=json.load(sys.stdin)
print(",".join(sorted({u["email"].lower() for u in d.get("userInfo",[]) if u.get("email")})))'
}

if [ -n "${1:-}" ]; then
  EMAILS="$(echo "$1" | tr -d ' ' | tr 'A-Z' 'a-z')"
else
  EMAILS="$(firebase_emails)"
  if [ -z "$EMAILS" ]; then
    echo "No logins found in Firebase yet. Create one first:"
    echo "  https://console.firebase.google.com/project/$PROJECT_ID/authentication/users  → Add user"
    exit 1
  fi
fi

# Every entry must be a real email address (guards against pasting an example placeholder).
IFS=',' read -ra LIST <<<"$EMAILS"
for e in "${LIST[@]}"; do
  if ! [[ "$e" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$ ]]; then
    echo "✗ \"$e\" is not an email address. Nothing was changed."
    echo "  Tip: run 'bash scripts/allow-email.sh' with nothing after it to allow your existing Firebase logins."
    exit 1
  fi
done

BUCKET="gs://${PROJECT_ID}-tfstate"
TFVARS="infra/terraform.tfvars"
[ -f "$TFVARS" ] || gcloud storage cp -q "$BUCKET/terraform.tfvars" "$TFVARS"
sed -i "s|^allowed_emails.*|allowed_emails  = \"$EMAILS\"|" "$TFVARS"
gcloud storage cp -q "$TFVARS" "$BUCKET/terraform.tfvars"

gcloud run services update "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --update-env-vars "^;^ALLOWED_EMAILS=$EMAILS" --quiet >/dev/null
echo "✓ Allowed to sign in: $EMAILS"
echo "  Wait about a minute, then sign in again."
