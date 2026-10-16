#!/usr/bin/env bash
# One-screen diagnosis of the deployed app. Prints no passwords or secrets.
#   cd ~/personal-tracker && bash scripts/diagnose.sh
PROJECT_ID="${PROJECT_ID:-mahisys-command-center}"
REGION="${REGION:-asia-south1}"
SERVICE="command-center"
TOKEN="$(gcloud auth print-access-token 2>/dev/null)"
H=(-H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT_ID" -H "Content-Type: application/json")
hr() { printf "\n\033[1;35m── %s\033[0m\n" "$*"; }

hr "App"
URL="$(gcloud run services describe $SERVICE --region $REGION --project $PROJECT_ID --format='value(status.url)' 2>/dev/null)"
echo "URL:            ${URL:-NOT DEPLOYED}"
[ -n "$URL" ] && echo "Health:         $(curl -s -o /dev/null -w '%{http_code}' "$URL/api/health") (200 = ok)"
echo "Allowed emails: $(gcloud run services describe $SERVICE --region $REGION --project $PROJECT_ID --format=json 2>/dev/null | python3 -c 'import json,sys
d=json.load(sys.stdin); env=d["spec"]["template"]["spec"]["containers"][0].get("env",[])
print(next((e.get("value") for e in env if e["name"]=="ALLOWED_EMAILS"),"(not set)"))' 2>/dev/null)"
echo "Firebase key:   $(gcloud run services describe $SERVICE --region $REGION --project $PROJECT_ID --format=json 2>/dev/null | python3 -c 'import json,sys
d=json.load(sys.stdin); env=d["spec"]["template"]["spec"]["containers"][0].get("env",[])
v=next((e.get("value","") for e in env if e["name"]=="FIREBASE_API_KEY"),"")
print("set" if v else "MISSING")' 2>/dev/null)"

hr "Logins that exist in Firebase"
curl -s "${H[@]}" -X POST "https://identitytoolkit.googleapis.com/v1/projects/$PROJECT_ID/accounts:query" -d '{"returnUserInfo":true,"limit":"50"}' \
  | python3 -c 'import json,sys
d=json.load(sys.stdin)
if "error" in d: print("Could not list users:", d["error"].get("message"))
else:
  users=d.get("userInfo",[])
  print("\n".join(f"- {u.get(\"email\",\"(no email)\")}  disabled={u.get(\"disabled\",False)}  providers={[p.get(\"providerId\") for p in u.get(\"providerUserInfo\",[])]}" for u in users) or "(no users yet)")'

hr "Sign-in settings"
curl -s "${H[@]}" "https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT_ID/config" \
  | python3 -c 'import json,sys
d=json.load(sys.stdin)
if "error" in d: print("Could not read config:", d["error"].get("message")); sys.exit()
s=d.get("signIn",{})
print("Email/password enabled:", s.get("email",{}).get("enabled"))
print("Sign-up disabled:      ", d.get("client",{}).get("permissions",{}).get("disabledUserSignup"))
print("Authorized domains:    ", ", ".join(d.get("authorizedDomains",[])))'
curl -s "${H[@]}" "https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT_ID/defaultSupportedIdpConfigs" \
  | python3 -c 'import json,sys
d=json.load(sys.stdin); c=[x["name"].split("/")[-1]+("" if x.get("enabled") else " (off)") for x in d.get("defaultSupportedIdpConfigs",[])]
print("Other providers:       ", ", ".join(c) or "none (Google sign-in not enabled)")' 2>/dev/null

hr "App errors in the last 2 hours"
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE AND severity>=WARNING AND timestamp>=\"$(date -u -d '-2 hours' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --project $PROJECT_ID --limit 12 --format='value(timestamp.date("%H:%M:%S"),textPayload)' 2>/dev/null | cut -c1-220 || true

hr "Last deploy"
read -r BID BST <<<"$(gcloud builds list --project $PROJECT_ID --limit 1 --sort-by=~createTime --format='value(id,status)' 2>/dev/null)"
echo "Build $BID: $BST"
if [ "$BST" = FAILURE ]; then
  gcloud builds describe "$BID" --project $PROJECT_ID --format=json | python3 -c 'import json,sys
for s in json.load(sys.stdin).get("steps",[]): print(f"  {s.get(\"id\")}: {s.get(\"status\")}")'
  echo "Last log lines:"
  gcloud logging read "resource.type=build AND resource.labels.build_id=$BID" --project $PROJECT_ID --limit 25 \
    --format='value(textPayload)' 2>/dev/null | tac | cut -c1-220
fi
echo
