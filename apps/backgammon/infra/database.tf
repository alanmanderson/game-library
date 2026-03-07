# Private DNS zone for PostgreSQL
resource "azurerm_private_dns_zone" "postgres" {
  name                = "backgammon.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.backgammon.name
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgres" {
  name                  = "postgres-vnet-link"
  private_dns_zone_name = azurerm_private_dns_zone.postgres.name
  resource_group_name   = azurerm_resource_group.backgammon.name
  virtual_network_id    = azurerm_virtual_network.backgammon.id
}

resource "azurerm_postgresql_flexible_server" "backgammon" {
  name                          = "psql-backgammon"
  location                      = azurerm_resource_group.backgammon.location
  resource_group_name           = azurerm_resource_group.backgammon.name
  version                       = "16"
  administrator_login           = "backgammonadmin"
  administrator_password        = var.db_admin_password
  sku_name                      = "B_Standard_B1ms"
  storage_mb                    = 32768
  delegated_subnet_id           = azurerm_subnet.postgres.id
  private_dns_zone_id           = azurerm_private_dns_zone.postgres.id
  public_network_access_enabled = false

  lifecycle {
    ignore_changes = [zone]
  }

  depends_on = [
    azurerm_private_dns_zone_virtual_network_link.postgres,
  ]
}

resource "azurerm_postgresql_flexible_server_database" "backgammon" {
  name      = "backgammon"
  server_id = azurerm_postgresql_flexible_server.backgammon.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}
