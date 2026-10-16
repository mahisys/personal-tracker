# Deploying Command Center to Google Cloud

Everything runs in your GCP project **`mahisys-command-center`**, in Mumbai (`asia-south1`).
One script creates the infrastructure and deploys the app; re-run it to ship each new version.

| Piece | Google Cloud service |
| --- | --- |
| App (web + installable phone app) | Cloud Run, container in Artifact Registry, built by Cloud Build |
| Database | Cloud SQL for PostgreSQL 16 (daily backups, 7-day point-in-time recovery) |
| Files (receipts, invoices, KYC) | Cloud Storage, private bucket with versioning |
| Login | Identity Platform / Firebase Authentication (sign-up disabled; only allowed emails) |
| Push notifications | Firebase Cloud Messaging |
| Automations | Cloud Scheduler → `/api/cron/run` every 15 minutes (IST) |
| Email digests | Gmail API (optional) |
| Secrets | Secret Manager |
| Monitoring | Uptime check + email alert, monthly budget alert |
| Infrastructure as code | Terraform in `infra/`, state in `gs://mahisys-command-center-tfstate` |

## 1. Deploy (about 20 minutes the first time, 5 minutes for updates)

1. Open **Cloud Shell**: <https://shell.cloud.google.com/?project=mahisys-command-center>
2. Paste this one line:
   ```bash
   cd ~/personal-tracker 2>/dev/null || { git clone https://github.com/mahisys/personal-tracker.git ~/personal-tracker && cd ~/personal-tracker; }; git checkout -q claude/loving-pasteur-un8o7x && git pull && bash scripts/deploy.sh
   ```
3. The first time it asks which email(s) may sign in and where alerts go.
4. It prepares the project, then hands the deploy to **Cloud Build**, which builds the app and creates
   or updates every resource with Terraform **on Google's servers**. You can close Cloud Shell or lock your
   phone at any point; the deploy keeps going. Watch it on the link the script prints.
5. Check the result at any time:
   ```bash
   cd ~/personal-tracker && bash scripts/status.sh
   ```
   Four green ticks = deployed, and it prints your app link
   (`https://command-center-304595122808.asia-south1.run.app`).

Running the deploy again is always safe: it reuses everything that exists, clears a lock left by an
interrupted run, and adopts resources an interrupted run created.

## 2. Create your login (once)

Sign-up from the app is disabled on purpose. In the Firebase console for the project:

- **Email + password:** Authentication → Users → **Add user** with an allowed email and a strong password.
- **Google sign-in (optional):** Authentication → Sign-in method → **Google** → Enable → Save.
- **Two-factor (recommended):** Authentication → Settings → Multi-factor authentication → enable SMS.

Only emails listed in `allowed_emails` can open the app, even if another account exists.

## 3. Install on your phone

Open the app URL in Chrome on Android (or Safari on iPhone) → menu → **Add to Home screen**.
It opens full-screen like a native app.

## 4. Push notifications

1. Firebase console → Project settings → **Cloud Messaging** → Web Push certificates → **Generate key pair**.
2. Paste the key into `infra/terraform.tfvars` as `fcm_vapid_key = "..."` and run `bash scripts/deploy.sh`.
3. In the app: Settings → Notifications → **Enable push on this device** (do it on each phone/laptop).

## 5. Email digests (optional, still Google-only)

The daily digest and weekly review are sent from your Gmail through the Gmail API.

1. Google Cloud console → APIs & Services → **OAuth consent screen**: type *External*, add your Gmail as a test user
   (or *Internal* if you use Google Workspace). Add the scope `https://www.googleapis.com/auth/gmail.send`.
2. APIs & Services → Credentials → **Create OAuth client ID** → type *Desktop app*. Note the client ID and secret.
3. Get a refresh token with the OAuth Playground (<https://developers.google.com/oauthplayground>): gear icon →
   *Use your own OAuth credentials* (paste ID/secret) → scope `https://www.googleapis.com/auth/gmail.send` →
   Authorize → Exchange authorization code for tokens → copy the **refresh token**.
   For a consent screen in *Testing*, refresh tokens expire after 7 days; publish the app (it stays private to you) to keep it.
4. Put `gmail_client_id`, `gmail_client_secret`, `gmail_refresh_token` and `gmail_sender` in `infra/terraform.tfvars`
   and run `bash scripts/deploy.sh`. Secrets go to Secret Manager, never into the image.

## Updating the app

Run `bash scripts/deploy.sh` again after pulling new code. Database migrations run automatically
when the new version starts. Optional continuous deployment: connect the GitHub repo in
Cloud Build → Triggers and use `cloudbuild.yaml`.

## Backups and restore

- Cloud SQL keeps 14 daily backups and 7 days of point-in-time recovery
  (Cloud SQL → `command-center-pg` → Backups / Clone to a point in time).
- Files in the bucket are versioned.
- In the app, Settings → **Export to Excel** downloads every table.

## Costs (approximate — check the GCP pricing calculator)

Cloud SQL `db-f1-micro` with 10 GB SSD is the main cost, roughly US$10–15 a month. Cloud Run scales to
zero and normally stays in the free tier for one user; Scheduler (3 free jobs), Firebase Auth, FCM and
Secret Manager are free or near-free at this size. A budget alert (₹3,000/month by default) emails you
at 50%, 90% and 100%. For more headroom later, set `db_tier = "db-g1-small"`.

## Local development

```bash
npm install
# Postgres 16 running locally with a database called command_center
cp .env.example .env.local      # AUTH_MODE=dev skips login locally
npm run db:migrate
npm run dev
npm test                        # unit + database tests (uses command_center_test)
```
