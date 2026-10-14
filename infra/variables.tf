variable "project_id" {
  description = "GCP project that hosts everything"
  type        = string
  default     = "mahisys-command-center"
}

variable "region" {
  description = "Region for Cloud Run, Cloud SQL, Storage and Scheduler (Mumbai)"
  type        = string
  default     = "asia-south1"
}

variable "service_name" {
  type    = string
  default = "command-center"
}

variable "image" {
  description = "Container image to run (set by scripts/deploy.sh)"
  type        = string
  default     = ""
}

variable "allowed_emails" {
  description = "Comma-separated emails allowed to sign in"
  type        = string
}

variable "alert_email" {
  description = "Where uptime and budget alerts go"
  type        = string
}

variable "db_tier" {
  description = "Cloud SQL machine tier. db-f1-micro is the smallest shared-core tier."
  type        = string
  default     = "db-f1-micro"
}

variable "billing_account" {
  description = "Billing account ID (XXXXXX-XXXXXX-XXXXXX) for the budget alert. Leave empty to skip the budget."
  type        = string
  default     = ""
}

variable "monthly_budget_inr" {
  type    = number
  default = 3000
}

variable "fcm_vapid_key" {
  description = "Web Push certificate key pair from Firebase console > Project settings > Cloud Messaging. Empty disables push."
  type        = string
  default     = ""
}

variable "gmail_client_id" {
  type    = string
  default = ""
}

variable "gmail_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "gmail_refresh_token" {
  type      = string
  default   = ""
  sensitive = true
}

variable "gmail_sender" {
  description = "Gmail address that sends digests and invoices"
  type        = string
  default     = ""
}
