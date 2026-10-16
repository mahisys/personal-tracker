#!/usr/bin/env bash
# Deploys Command Center to Google Cloud.
#
#   bash scripts/deploy.sh
#
# The heavy lifting (building the image and creating/updating every cloud resource with Terraform)
# runs inside Google Cloud Build, on Google's servers. This script only prepares the project and
# starts that build, so closing Cloud Shell, losing Wi-Fi or locking your phone never interrupts a deploy.
# Safe to run as often as you like: every run picks up from whatever already exists.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-mahisys-command-center}"
REGION="${REGION:-asia-south1}"
SERVICE="command-center"
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

say() { printf "\n\033[1;35m▸ %s\033[0m\n" "$*"; }
ok() { printf "  \033[32m✓\033[0m %s\n" "$*"; }

gcloud config set project "$PROJECT_ID" >/dev/null 2>&1
ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
[ -n "$ACCOUNT" ] || { echo "Run 'gcloud auth login' first"; exit 1; }
NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
STATE_BUCKET="${PROJECT_ID}-tfstate"
DEPLOYER="${SERVICE}-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

# ---------------------------------------------------------------------------
say "1/4  Settings"
TFVARS="$ROOT/infra/terraform.tfvars"
if [ ! -f "$TFVARS" ] && gcloud storage cat "gs://$STATE_BUCKET/terraform.tfvars" >/dev/null 2>&1; then
  gcloud storage cp -q "gs://$STATE_BUCKET/terraform.tfvars" "$TFVARS"
fi
if [ ! -f "$TFVARS" ]; then
  read -r -p "  Email(s) allowed to sign in (comma-separated) [$ACCOUNT]: " EMAILS; EMAILS="${EMAILS:-$ACCOUNT}"
  read -r -p "  Email for uptime and budget alerts [$ACCOUNT]: " ALERT; ALERT="${ALERT:-$ACCOUNT}"
  cat > "$TFVARS" <<TF
project_id      = "$PROJECT_ID"
region          = "$REGION"
allowed_emails  = "$EMAILS"
alert_email     = "$ALERT"
fcm_vapid_key   = ""
gmail_client_id     = ""
gmail_client_secret = ""
gmail_refresh_token = ""
gmail_sender        = ""
TF
fi
# The budget is created below with your own account (Cloud Build cannot manage billing accounts).
sed -i '/^billing_account/d;/^monthly_budget_inr/d' "$TFVARS"
ok "Using $TFVARS"

# ---------------------------------------------------------------------------
say "2/4  Preparing the project (APIs, state bucket, deploy account)"
gcloud services enable \
  cloudbuild.googleapis.com compute.googleapis.com artifactregistry.googleapis.com run.googleapis.com \
  sqladmin.googleapis.com secretmanager.googleapis.com iam.googleapis.com cloudresourcemanager.googleapis.com \
  serviceusage.googleapis.com storage.googleapis.com logging.googleapis.com billingbudgets.googleapis.com \
  firebase.googleapis.com identitytoolkit.googleapis.com --project "$PROJECT_ID"
ok "APIs enabled"

if ! gcloud storage buckets describe "gs://$STATE_BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$STATE_BUCKET" --location="$REGION" --uniform-bucket-level-access --public-access-prevention
  gcloud storage buckets update "gs://$STATE_BUCKET" --versioning
fi
gcloud storage cp -q "$TFVARS" "gs://$STATE_BUCKET/terraform.tfvars"
ok "Settings saved to gs://$STATE_BUCKET (so Cloud Build can read them)"

if ! gcloud iam service-accounts describe "$DEPLOYER" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SERVICE}-deployer" --display-name "Command Center deployer (Cloud Build)"
fi
# The deployer creates every resource in this one project, so it is a project owner. It is used only by Cloud Build.
for i in $(seq 1 12); do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOYER" --role=roles/owner \
    --condition=None --quiet >/dev/null 2>&1 && break
  sleep 10
done
ok "Deploy account ready: $DEPLOYER"

# Monthly budget alert (₹3,000), created once with your account.
BILLING="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)' 2>/dev/null | sed 's#billingAccounts/##' || true)"
if [ -n "$BILLING" ] && ! gcloud billing budgets list --billing-account="$BILLING" --format='value(displayName)' 2>/dev/null | grep -q "Command Center monthly budget"; then
  gcloud billing budgets create --billing-account="$BILLING" --display-name="Command Center monthly budget" \
    --budget-amount=3000INR --filter-projects="projects/$NUMBER" \
    --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 >/dev/null 2>&1 \
    && ok "Budget alert set at ₹3,000/month" || echo "  (Budget alert skipped — you can add one under Billing → Budgets.)"
fi

# ---------------------------------------------------------------------------
# A deploy that was cut off can leave Terraform's lock behind. With no deploy running, it is safe to clear.
if [ -z "$(gcloud builds list --ongoing --format='value(id)' 2>/dev/null)" ]; then
  gcloud storage rm -q "gs://$STATE_BUCKET/command-center/default.tflock" >/dev/null 2>&1 && ok "Cleared a lock left by an interrupted deploy" || true
else
  echo "  A deploy is already running. Watch it with: bash scripts/status.sh"; exit 0
fi

say "3/4  Starting the deploy on Google Cloud Build"
TAG="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo manual)-$(date +%Y%m%d%H%M%S)"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$SERVICE/app:$TAG"
BUILD_ID=""
for attempt in 1 2 3 4 5 6; do
  # New permissions can take a few minutes to apply in a fresh project; retry until Cloud Build accepts the job.
  if BUILD_ID="$(gcloud builds submit "$ROOT" --config cloudbuild.deploy.yaml --async --format='value(id)' \
        --service-account="projects/$PROJECT_ID/serviceAccounts/$DEPLOYER" \
        --substitutions="_IMAGE=$IMAGE,_STATE_BUCKET=$STATE_BUCKET,_REGION=$REGION,_SERVICE=$SERVICE" 2>/tmp/cc-submit.log)"; then
    [ -n "$BUILD_ID" ] && break
  fi
  if [ "$attempt" = 6 ]; then cat /tmp/cc-submit.log; echo "Cloud Build would not accept the job. Wait 5 minutes and run this script again."; exit 1; fi
  echo "  Cloud Build is not ready yet (new permissions still applying). Retrying in 60 seconds… ($attempt/6)"
  sleep 60
done
LINK="https://console.cloud.google.com/cloud-build/builds/$BUILD_ID?project=$PROJECT_ID"
ok "Deploy started (build $BUILD_ID)"
cat <<INFO

  It now runs on Google's servers: about 5 minutes for a normal update,
  15–20 minutes the very first time (creating the database).
  You can close this window at any time — the deploy keeps going.

  Watch it live:  $LINK
  Check later:    bash scripts/status.sh
INFO

# ---------------------------------------------------------------------------
say "4/4  Progress (safe to close — this only watches)"
LAST=""
while true; do
  STATUS="$(gcloud builds describe "$BUILD_ID" --format='value(status)' 2>/dev/null || echo UNKNOWN)"
  STEP="$(gcloud builds describe "$BUILD_ID" --format='json(steps)' 2>/dev/null | python3 -c 'import json,sys
s=json.load(sys.stdin).get("steps",[])
run=[x.get("id","?") for x in s if x.get("status")=="WORKING"]
done_=[x for x in s if x.get("status")=="SUCCESS"]
print((run[0] if run else "") + f"  ({len(done_)}/{len(s)} steps done)")' 2>/dev/null || true)"
  NOW="$STATUS $STEP"
  [ "$NOW" != "$LAST" ] && printf "  %s  %s\n" "$(date +%H:%M:%S)" "$NOW" && LAST="$NOW"
  case "$STATUS" in
    SUCCESS) break ;;
    FAILURE|INTERNAL_ERROR|TIMEOUT|CANCELLED|EXPIRED)
      echo; echo "  The deploy stopped: $STATUS. Open $LINK to see which step failed, or run 'bash scripts/status.sh'."
      exit 1 ;;
  esac
  sleep 20
done

bash "$ROOT/scripts/status.sh"
