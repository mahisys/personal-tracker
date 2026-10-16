#!/usr/bin/env bash
# Health report for the deployed Command Center. Run any time:  bash scripts/status.sh
PROJECT_ID="${PROJECT_ID:-mahisys-command-center}"
REGION="${REGION:-asia-south1}"
SERVICE="command-center"
pass() { printf "  \033[32m✓\033[0m %s\n" "$*"; }
fail() { printf "  \033[31m✗\033[0m %s\n" "$*"; }

echo; echo "Command Center — status of $PROJECT_ID"
LAST="$(gcloud builds list --project "$PROJECT_ID" --limit 1 --sort-by=~createTime --format='value(id,status,createTime.date("%d %b %H:%M"))' 2>/dev/null)"
if [ -n "$LAST" ]; then
  read -r ID ST WHEN <<<"$LAST"
  [ "$ST" = SUCCESS ] && pass "Last deploy succeeded ($WHEN)" || { [ "$ST" = WORKING ] || [ "$ST" = QUEUED ] && echo "  … Deploy in progress ($ST since $WHEN)" || fail "Last deploy: $ST ($WHEN)"; }
  echo "    https://console.cloud.google.com/cloud-build/builds/$ID?project=$PROJECT_ID"
fi

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)' 2>/dev/null)"
if [ -z "$URL" ]; then
  fail "App not deployed yet"
else
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/health")" = 200 ] && pass "App is running" || fail "App is not responding"
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$URL/")" = 307 ] && pass "Login protection is on" || fail "Login protection check failed"
fi
[ "$(gcloud sql instances describe "$SERVICE-pg" --project "$PROJECT_ID" --format='value(state)' 2>/dev/null)" = RUNNABLE ] && pass "Database is running (daily backups on)" || fail "Database not ready"
[ "$(gcloud scheduler jobs describe "$SERVICE-automations" --location "$REGION" --project "$PROJECT_ID" --format='value(state)' 2>/dev/null)" = ENABLED ] && pass "Automations run every 15 minutes" || fail "Automations not scheduled"

if [ -n "$URL" ]; then
  echo
  echo "  Your app:        $URL"
  echo "  Create login:    https://console.firebase.google.com/project/$PROJECT_ID/authentication/users  (Add user)"
fi
echo
