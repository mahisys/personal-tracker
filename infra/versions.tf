terraform {
  required_version = ">= 1.6"
  # State lives in a GCS bucket created by scripts/deploy.sh (-backend-config=bucket=...).
  backend "gcs" {
    prefix = "command-center"
  }
  required_providers {
    google      = { source = "hashicorp/google", version = "~> 8.0" }
    google-beta = { source = "hashicorp/google-beta", version = "~> 8.0" }
    random      = { source = "hashicorp/random", version = ">= 3.6" }
  }
}

provider "google" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

provider "google-beta" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}
