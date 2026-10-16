#!/bin/sh
# Brings resources that exist in Google Cloud but are missing from Terraform state under management.
# This happens when a deploy is interrupted mid-way (for example Cloud SQL finished creating after the
# deploy was cut off). Each import is tried only if the address is not in state; a resource that does
# not exist simply fails to import and is created normally by the apply that follows.
# Usage (inside infra/, after terraform init):  sh adopt.sh <project> <region> <image>
P="$1"; R="$2"; IMAGE="$3"; S=command-center
STATE="$(terraform state list 2>/dev/null)"
adopt() {
  echo "$STATE" | grep -qxF "$1" && return 0
  if terraform import -input=false -var "image=$IMAGE" "$1" "$2" >/dev/null 2>&1; then echo "Adopted existing $1"; fi
}
adopt google_artifact_registry_repository.app "projects/$P/locations/$R/repositories/$S"
adopt google_sql_database_instance.db "projects/$P/instances/$S-pg"
adopt google_sql_database.app "projects/$P/instances/$S-pg/databases/command_center"
adopt google_sql_user.app "$P/$S-pg/app"
adopt google_storage_bucket.files "$P-files"
adopt google_service_account.run "projects/$P/serviceAccounts/$S-run@$P.iam.gserviceaccount.com"
adopt 'google_secret_manager_secret.s["database-url"]' "projects/$P/secrets/$S-database-url"
adopt 'google_secret_manager_secret.s["cron-secret"]' "projects/$P/secrets/$S-cron-secret"
adopt google_firebase_project.this "projects/$P"
adopt google_identity_platform_config.auth "projects/$P/config"
adopt google_cloud_run_v2_service.app "projects/$P/locations/$R/services/$S"
adopt google_cloud_scheduler_job.automations "projects/$P/locations/$R/jobs/$S-automations"
exit 0
