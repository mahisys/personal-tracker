#!/usr/bin/env bash
# One-command deploy to Google Cloud. Run it in Cloud Shell (https://shell.cloud.google.com) from the repo root:
#   bash scripts/deploy.sh
# First run creates everything (≈15 minutes, mostly Cloud SQL). Later runs build and roll out a new version.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-mahisys-command-center}"
REGION="${REGION:-asia-south1}"
SERVICE="command-center"
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

say() { printf "\n\033[1;35m▸ %s\033[0m\n" "$*"; }

command -v terraform >/dev/null || { echo "terraform is required (it is pre-installed in Cloud Shell)"; exit 1; }
gcloud config set project "$PROJECT_ID" >/dev/null
ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
[ -n "$ACCOUNT" ] || { echo "Run 'gcloud auth login' first"; exit 1; }
# Terraform uses Application Default Credentials.
gcloud auth application-default print-access-token >/dev/null 2>&1 || gcloud auth application-default login
gcloud auth application-default set-quota-project "$PROJECT_ID" >/dev/null 2>&1 || true

TFVARS="$ROOT/infra/terraform.tfvars"
if [ ! -f "$TFVARS" ]; then
  say "First-time setup"
  read -r -p "Email(s) allowed to sign in (comma-separated) [$ACCOUNT]: " EMAILS; EMAILS="${EMAILS:-$ACCOUNT}"
  read -r -p "Email for uptime and budget alerts [$ACCOUNT]: " ALERT; ALERT="${ALERT:-$ACCOUNT}"
  BILLING="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)' 2>/dev/null | sed 's#billingAccounts/##' || true)"
  cat > "$TFVARS" <<TF
project_id      = "$PROJECT_ID"
region          = "$REGION"
allowed_emails  = "$EMAILS"
alert_email     = "$ALERT"
billing_account = "$BILLING"
monthly_budget_inr = 3000
fcm_vapid_key   = ""
gmail_client_id     = ""
gmail_client_secret = ""
gmail_refresh_token = ""
gmail_sender        = ""
TF
  echo "Saved $TFVARS (edit it any time and re-run this script)."
fi

STATE_BUCKET="${PROJECT_ID}-tfstate"
if ! gcloud storage buckets describe "gs://$STATE_BUCKET" >/dev/null 2>&1; then
  say "Creating Terraform state bucket gs://$STATE_BUCKET"
  gcloud services enable storage.googleapis.com
  gcloud storage buckets create "gs://$STATE_BUCKET" --location="$REGION" --uniform-bucket-level-access --public-access-prevention
  gcloud storage buckets update "gs://$STATE_BUCKET" --versioning
fi

cd "$ROOT/infra"
terraform init -input=false -upgrade -backend-config="bucket=$STATE_BUCKET" >/dev/null

say "Enabling Google Cloud APIs (first run takes a few minutes)"
gcloud services enable \
  cloudbuild.googleapis.com compute.googleapis.com artifactregistry.googleapis.com run.googleapis.com \
  sqladmin.googleapis.com secretmanager.googleapis.com iam.googleapis.com cloudresourcemanager.googleapis.com \
  serviceusage.googleapis.com storage.googleapis.com --project "$PROJECT_ID"

# Cloud Build runs as the Compute default service account in new projects. Google creates it a little
# after the Compute API is enabled, and builds fail with NOT_FOUND until it exists — so wait for it.
NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
BUILD_SA="${NUMBER}-compute@developer.gserviceaccount.com"
for i in $(seq 1 30); do
  gcloud iam service-accounts describe "$BUILD_SA" --project "$PROJECT_ID" >/dev/null 2>&1 && break
  [ "$i" = 1 ] && echo "Waiting for Google to create the build service account…"
  sleep 10
done

say "Creating the image registry and build permissions"
terraform apply -input=false -auto-approve \
  -target=google_project_service.apis \
  -target=google_artifact_registry_repository.app \
  -target=google_project_iam_member.build_roles

TAG="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%s)-$(date +%Y%m%d%H%M%S)"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$SERVICE/app:$TAG"
say "Building $IMAGE with Cloud Build (about 5 minutes)"
# Freshly enabled APIs and permissions can take a few minutes to take effect, so retry a few times.
for attempt in 1 2 3 4 5; do
  if gcloud builds submit "$ROOT" --tag "$IMAGE" --timeout=1800 --project "$PROJECT_ID"; then
    break
  fi
  if [ "$attempt" = 5 ]; then
    echo "The build kept failing. Wait 5 minutes and run 'bash scripts/deploy.sh' again."
    exit 1
  fi
  echo "Build did not start yet (Google is still setting up Cloud Build). Retrying in 60 seconds… ($attempt/5)"
  sleep 60
done

say "Applying infrastructure and rolling out"
terraform apply -input=false -auto-approve -var "image=$IMAGE"

URL="$(terraform output -raw app_url)"
say "Done — your Command Center is live at: $URL"
cat <<NEXT

Next steps (first deploy only — see DEPLOY.md for details):
  1. Create your login: Firebase console → Authentication → Users → Add user (your email + a password),
     or enable the Google sign-in provider there.  $(terraform output -raw firebase_console)/authentication/users
  2. Push notifications: Firebase console → Project settings → Cloud Messaging → Web Push certificates →
     Generate key pair, paste it into infra/terraform.tfvars as fcm_vapid_key, re-run this script.
  3. Open $URL on your phone and choose "Add to Home screen".
NEXT
