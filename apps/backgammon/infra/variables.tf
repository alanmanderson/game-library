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
  description = "Domain name for the app (e.g. backgammon.example.com)"
  type        = string
}

variable "db_admin_login" {
  description = "Login for the shared PostgreSQL admin user"
  type        = string
  default     = "pgadmin"
}

variable "db_admin_password" {
  description = "Password for the shared PostgreSQL admin user"
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

# TODO: Restrict this to your actual IP addresses for production use
variable "allowed_ssh_ips" {
  description = "List of CIDR blocks allowed to SSH into the VM (e.g. [\"203.0.113.10/32\"])"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "enable_training_vm" {
  description = "Whether to provision the (primary) ML training VM — off by default, flip on only while training."
  type        = bool
  default     = false
}

variable "enable_training_vm_2" {
  description = "Whether to provision the secondary ML training VM — off by default."
  type        = bool
  default     = false
}

variable "training_vm_size" {
  description = "Azure VM size for the primary ML training VM."
  type        = string
  default     = "Standard_D4s_v5"
}

variable "training_vm_2_size" {
  description = "Azure VM size for the secondary ML training VM."
  type        = string
  default     = "Standard_D4s_v5"
}
