variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "location" {
  description = "Azure region for the resource group"
  type        = string
  default     = "centralus"
}
