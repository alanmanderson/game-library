# Shared resources (created by backgammon as the first app deployed)

resource "azurerm_resource_group" "shared" {
  name     = "rg-shared"
  location = var.location
}

resource "azurerm_postgresql_flexible_server" "shared" {
  name                          = "psql-shared"
  location                      = var.location
  resource_group_name           = azurerm_resource_group.shared.name
  version                       = "16"
  administrator_login           = var.db_admin_login
  administrator_password        = var.db_admin_password
  sku_name                      = "B_Standard_B1ms"
  storage_mb                    = 32768
  public_network_access_enabled = true

  lifecycle {
    ignore_changes = [zone]
  }
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure" {
  name             = "AllowAzureServices"
  server_id        = azurerm_postgresql_flexible_server.shared.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

resource "azurerm_postgresql_flexible_server_database" "backgammon" {
  name      = "backgammon"
  server_id = azurerm_postgresql_flexible_server.shared.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# Shared App Service Plan

resource "azurerm_service_plan" "shared" {
  name                = "plan-shared"
  location            = var.location
  resource_group_name = azurerm_resource_group.shared.name
  os_type             = "Linux"
  sku_name            = "B1"
}
