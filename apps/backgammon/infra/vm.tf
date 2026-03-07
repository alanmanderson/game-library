resource "azurerm_linux_virtual_machine" "backgammon" {
  name                = "vm-backgammon"
  location            = azurerm_resource_group.backgammon.location
  resource_group_name = azurerm_resource_group.backgammon.name
  size                = "Standard_B2ats_v2"
  admin_username      = "azureuser"

  network_interface_ids = [
    azurerm_network_interface.backgammon.id,
  ]

  admin_ssh_key {
    username   = "azureuser"
    public_key = file(var.ssh_public_key_path)
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
    disk_size_gb         = 30
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "ubuntu-24_04-lts"
    sku       = "server"
    version   = "latest"
  }

  custom_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tpl", {
    domain_name       = var.domain_name
    db_host           = azurerm_postgresql_flexible_server.backgammon.fqdn
    db_admin_password = var.db_admin_password
    app_secret_key    = var.app_secret_key
    google_client_id  = var.google_client_id
  }))
}
