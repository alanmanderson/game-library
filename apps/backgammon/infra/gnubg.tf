############################################################################
# vm-gnubg — dedicated VM hosting the internal gnubg analysis service.
#
# Lives in the same VNet/subnet as vm-backgammon but has no public IP.
# Only the app subnet (10.0.1.0/24) can reach port 8001. SSH access is
# via ProxyJump through vm-backgammon.
#
# This file is entirely additive: it does not modify any resource defined
# in vm.tf or network.tf. Removing it has no effect on the main app.
############################################################################

resource "azurerm_network_interface" "gnubg" {
  name                = "nic-gnubg"
  location            = azurerm_resource_group.backgammon.location
  resource_group_name = azurerm_resource_group.backgammon.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.vm.id
    private_ip_address_allocation = "Dynamic"
    # Intentionally no public_ip_address_id — reachable only within the VNet.
  }
}

# Internal-only rule: allow the app subnet to hit port 8001 on the gnubg VM.
# The subnet NSG (nsg-backgammon) is shared between vm-backgammon and
# vm-gnubg via the subnet association in network.tf, so adding the rule
# here is sufficient.
resource "azurerm_network_security_rule" "allow_gnubg_internal_8001" {
  name                        = "allow-gnubg-internal-8001"
  resource_group_name         = azurerm_resource_group.backgammon.name
  network_security_group_name = azurerm_network_security_group.backgammon.name
  priority                    = 1010
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "8001"
  source_address_prefix       = "10.0.1.0/24"
  destination_address_prefix  = "*"
}

resource "azurerm_linux_virtual_machine" "gnubg" {
  name                = "vm-gnubg"
  location            = azurerm_resource_group.backgammon.location
  resource_group_name = azurerm_resource_group.backgammon.name
  size                = "Standard_B1s"
  admin_username      = "azureuser"

  network_interface_ids = [
    azurerm_network_interface.gnubg.id,
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

  custom_data = base64encode(file("${path.module}/cloud-init-gnubg.yaml.tpl"))
}
