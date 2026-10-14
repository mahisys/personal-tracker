output "app_url" {
  value = local.app_url
}

output "image_repository" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "database_instance" {
  value = google_sql_database_instance.db.connection_name
}

output "files_bucket" {
  value = google_storage_bucket.files.name
}

output "firebase_console" {
  value = "https://console.firebase.google.com/project/${var.project_id}"
}
