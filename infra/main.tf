# Command Center on Google Cloud.
# Cloud Run (app) + Cloud SQL Postgres 16 (data) + Cloud Storage (files) + Secret Manager (secrets)
# + Identity Platform / Firebase Auth (login) + Firebase Cloud Messaging (push)
# + Cloud Scheduler (automations) + Monitoring (uptime alert) + Billing budget.

data "google_project" "this" {
  project_id = var.project_id
}

locals {
  app_url       = "https://${var.service_name}-${data.google_project.this.number}.${var.region}.run.app"
  gmail_enabled = var.gmail_client_id != "" && var.gmail_refresh_token != ""
  services = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudscheduler.googleapis.com",
    "storage.googleapis.com",
    "iam.googleapis.com",
    "identitytoolkit.googleapis.com",
    "firebase.googleapis.com",
    "fcm.googleapis.com",
    "fcmregistrations.googleapis.com",
    "gmail.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "apikeys.googleapis.com",
    "compute.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

# ---------------------------------------------------------------------------
# Container registry
# ---------------------------------------------------------------------------
resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = var.service_name
  format        = "DOCKER"
  description   = "Command Center images"
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }
  depends_on = [google_project_service.apis]
}

# Cloud Build runs as the Compute default service account in new projects; let it push images and write logs.
resource "google_project_iam_member" "build_roles" {
  for_each = toset([
    "roles/artifactregistry.writer",
    "roles/logging.logWriter",
    "roles/storage.objectViewer",
  ])
  project    = var.project_id
  role       = each.value
  member     = "serviceAccount:${data.google_project.this.number}-compute@developer.gserviceaccount.com"
  depends_on = [google_project_service.apis]
}

# ---------------------------------------------------------------------------
# Database: Cloud SQL for PostgreSQL 16, daily backups + point-in-time recovery
# ---------------------------------------------------------------------------
resource "google_sql_database_instance" "db" {
  name                = "${var.service_name}-pg"
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = true

  settings {
    tier              = var.db_tier
    edition           = "ENTERPRISE"
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = 10
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      start_time                     = "21:00" # 02:30 IST
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 14
      }
    }

    ip_configuration {
      ipv4_enabled = true # reached only through the Cloud SQL connector (IAM-authorised), no authorised networks
      ssl_mode     = "ENCRYPTED_ONLY"
    }

    maintenance_window {
      day  = 7
      hour = 22
    }

    insights_config {
      query_insights_enabled = true
    }
  }
  depends_on = [google_project_service.apis]
}

resource "google_sql_database" "app" {
  name     = "command_center"
  instance = google_sql_database_instance.db.name
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "google_sql_user" "app" {
  name     = "app"
  instance = google_sql_database_instance.db.name
  password = random_password.db.result
}

# ---------------------------------------------------------------------------
# Secrets
# ---------------------------------------------------------------------------
resource "random_password" "cron" {
  length  = 48
  special = false
}

locals {
  database_url = "postgres://${google_sql_user.app.name}:${random_password.db.result}@localhost/${google_sql_database.app.name}?host=/cloudsql/${google_sql_database_instance.db.connection_name}"
  secrets = merge(
    {
      "database-url" = local.database_url
      "cron-secret"  = random_password.cron.result
    },
    local.gmail_enabled ? {
      "gmail-client-id"     = var.gmail_client_id
      "gmail-client-secret" = var.gmail_client_secret
      "gmail-refresh-token" = var.gmail_refresh_token
    } : {}
  )
}

resource "google_secret_manager_secret" "s" {
  for_each  = nonsensitive(toset(keys(local.secrets)))
  secret_id = "${var.service_name}-${each.value}"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "s" {
  for_each    = nonsensitive(toset(keys(local.secrets)))
  secret      = google_secret_manager_secret.s[each.value].id
  secret_data = local.secrets[each.value]
}

# ---------------------------------------------------------------------------
# File storage (receipts, invoices, KYC documents) — private bucket
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "files" {
  name                        = "${var.project_id}-files"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  versioning {
    enabled = true
  }
  lifecycle_rule {
    condition {
      num_newer_versions = 3
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }
  depends_on = [google_project_service.apis]
}

# ---------------------------------------------------------------------------
# Runtime identity
# ---------------------------------------------------------------------------
resource "google_service_account" "run" {
  account_id   = "${var.service_name}-run"
  display_name = "Command Center (Cloud Run)"
}

resource "google_project_iam_member" "run_roles" {
  for_each = toset([
    "roles/cloudsql.client",
    "roles/firebaseauth.admin",
    "roles/firebasecloudmessaging.admin",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.run.email}"
}

resource "google_secret_manager_secret_iam_member" "run" {
  for_each  = google_secret_manager_secret.s
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

resource "google_storage_bucket_iam_member" "run" {
  bucket = google_storage_bucket.files.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.run.email}"
}

# ---------------------------------------------------------------------------
# Login (Identity Platform / Firebase Auth) and push (Firebase Cloud Messaging)
# ---------------------------------------------------------------------------
resource "google_firebase_project" "this" {
  provider   = google-beta
  project    = var.project_id
  depends_on = [google_project_service.apis]
}

resource "google_firebase_web_app" "app" {
  provider        = google-beta
  project         = var.project_id
  display_name    = "Command Center"
  deletion_policy = "DELETE"
  depends_on      = [google_firebase_project.this]
}

data "google_firebase_web_app_config" "app" {
  provider   = google-beta
  project    = var.project_id
  web_app_id = google_firebase_web_app.app.app_id
}

resource "google_identity_platform_config" "auth" {
  project                    = var.project_id
  autodelete_anonymous_users = true
  authorized_domains = [
    "localhost",
    "${var.project_id}.firebaseapp.com",
    "${var.project_id}.web.app",
    trimprefix(local.app_url, "https://"),
  ]
  sign_in {
    allow_duplicate_emails = false
    email {
      enabled           = true
      password_required = true
    }
  }
  # Nobody can create an account from the app; you add your own user in the console (see DEPLOY.md).
  client {
    permissions {
      disabled_user_signup   = true
      disabled_user_deletion = true
    }
  }
  depends_on = [google_firebase_project.this]
}

# ---------------------------------------------------------------------------
# The app: Cloud Run
# ---------------------------------------------------------------------------
locals {
  secret_env = merge(
    { DATABASE_URL = "database-url", CRON_SECRET = "cron-secret" },
    local.gmail_enabled ? {
      GMAIL_CLIENT_ID     = "gmail-client-id"
      GMAIL_CLIENT_SECRET = "gmail-client-secret"
      GMAIL_REFRESH_TOKEN = "gmail-refresh-token"
    } : {}
  )
  plain_env = {
    NODE_ENV                     = "production"
    APP_URL                      = local.app_url
    ALLOWED_EMAILS               = var.allowed_emails
    GCS_BUCKET                   = google_storage_bucket.files.name
    GOOGLE_CLOUD_PROJECT         = var.project_id
    FIREBASE_PROJECT_ID          = var.project_id
    FIREBASE_API_KEY             = data.google_firebase_web_app_config.app.api_key
    FIREBASE_AUTH_DOMAIN         = data.google_firebase_web_app_config.app.auth_domain
    FIREBASE_APP_ID              = google_firebase_web_app.app.app_id
    FIREBASE_MESSAGING_SENDER_ID = data.google_firebase_web_app_config.app.messaging_sender_id
    FIREBASE_VAPID_KEY           = var.fcm_vapid_key
    GMAIL_SENDER                 = var.gmail_sender
    DB_POOL_MAX                  = "5"
  }
}

resource "google_cloud_run_v2_service" "app" {
  name                = var.service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account                  = google_service_account.run.email
    timeout                          = "300s"
    max_instance_request_concurrency = 40

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.db.connection_name]
      }
    }

    containers {
      image = var.image

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      ports {
        container_port = 8080
      }

      dynamic "env" {
        for_each = local.plain_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.s[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      startup_probe {
        http_get {
          path = "/api/health"
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        failure_threshold     = 24
      }
    }
  }

  depends_on = [
    google_project_iam_member.run_roles,
    google_secret_manager_secret_iam_member.run,
    google_secret_manager_secret_version.s,
  ]
}

# The app does its own login, so the URL is reachable by anyone; every page requires a session.
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---------------------------------------------------------------------------
# Automations: Cloud Scheduler calls the cron endpoint every 15 minutes (IST)
# ---------------------------------------------------------------------------
resource "google_cloud_scheduler_job" "automations" {
  name             = "${var.service_name}-automations"
  region           = var.region
  schedule         = "*/15 * * * *"
  time_zone        = "Asia/Kolkata"
  attempt_deadline = "300s"
  retry_config {
    retry_count = 1
  }
  http_target {
    http_method = "POST"
    uri         = "${local.app_url}/api/cron/run"
    headers = {
      "x-cron-secret" = random_password.cron.result
      "Content-Type"  = "application/json"
    }
    body = base64encode("{\"trigger\":\"scheduler\"}")
  }
  depends_on = [google_cloud_run_v2_service.app]
}

# ---------------------------------------------------------------------------
# Monitoring: uptime check + email alert, and a monthly budget alert
# ---------------------------------------------------------------------------
resource "google_monitoring_notification_channel" "email" {
  display_name = "Command Center alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
  depends_on = [google_project_service.apis]
}

resource "google_monitoring_uptime_check_config" "health" {
  display_name = "Command Center health"
  timeout      = "10s"
  period       = "900s"
  http_check {
    path         = "/api/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }
  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = trimprefix(local.app_url, "https://")
    }
  }
  depends_on = [google_cloud_run_v2_service.app]
}

resource "google_monitoring_alert_policy" "down" {
  display_name = "Command Center is down"
  combiner     = "OR"
  conditions {
    display_name = "Health check failing"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.health.uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "1800s"
      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }
    }
  }
  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_billing_budget" "monthly" {
  count           = var.billing_account == "" ? 0 : 1
  billing_account = var.billing_account
  display_name    = "Command Center monthly budget"
  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }
  amount {
    specified_amount {
      currency_code = "INR"
      units         = tostring(var.monthly_budget_inr)
    }
  }
  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }
  all_updates_rule {
    monitoring_notification_channels = [google_monitoring_notification_channel.email.id]
    disable_default_iam_recipients   = false
  }
}
