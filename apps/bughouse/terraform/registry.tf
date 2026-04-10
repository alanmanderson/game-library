resource "azurerm_container_registry" "main" {
  name                = replace("acr${local.resource_prefix}", "-", "")
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  # Admin access is disabled for security. Use managed identity or a service
  # principal with the AcrPull RBAC role for container image pulls instead.
  admin_enabled       = false

  tags = {
    project     = var.project_name
    environment = var.environment
  }
}
