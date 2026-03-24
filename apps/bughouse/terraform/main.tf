locals {
  resource_prefix = "${var.project_name}-${var.environment}"
}

resource "azurerm_resource_group" "main" {
  name     = "rg-${local.resource_prefix}"
  location = var.location

  tags = {
    project     = var.project_name
    environment = var.environment
  }
}
