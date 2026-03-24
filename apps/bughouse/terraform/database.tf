resource "azurerm_postgresql_flexible_server" "main" {
  name                          = "psql-${local.resource_prefix}"
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  version                       = "16"
  administrator_login           = "bughouseadmin"
  administrator_password        = var.db_admin_password
  sku_name                      = "B_Standard_B1ms"
  storage_mb                    = 32768
  delegated_subnet_id           = azurerm_subnet.postgres.id
  private_dns_zone_id           = azurerm_private_dns_zone.postgres.id
  public_network_access_enabled = false
  zone                          = "1"

  depends_on = [
    azurerm_private_dns_zone_virtual_network_link.postgres
  ]

  tags = {
    project     = var.project_name
    environment = var.environment
  }
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = var.project_name
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}
