variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "eastus"
}

variable "domain_name" {
  description = "Domain name for the app (e.g. pinochle.example.com)"
  type        = string
}

variable "db_admin_password" {
  description = "Password for the PostgreSQL admin user"
  type        = string
  sensitive   = true
}

variable "app_secret_key" {
  description = "Secret key for JWT signing in the FastAPI app"
  type        = string
  sensitive   = true
}

variable "ssh_public_key_path" {
  description = "Path to SSH public key for VM access"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "google_client_id" {
  description = "Google OAuth client ID for authentication"
  type        = string
  default     = ""
}

variable "ssh_allowed_cidr" {
  description = "CIDR block allowed to SSH into the VM. Restrict to specific IPs in production."
  type        = string
  default     = "0.0.0.0/0"
}
