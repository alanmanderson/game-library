# Temporary training VM for extended ML model training
# Enable with: terraform apply -var="enable_training_vm=true"
# Destroy with: terraform apply -var="enable_training_vm=false"

# Public IP for training VM
resource "azurerm_public_ip" "training" {
  count               = var.enable_training_vm ? 1 : 0
  name                = "pip-training"
  location            = azurerm_resource_group.backgammon.location
  resource_group_name = azurerm_resource_group.backgammon.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

# NIC for training VM — reuses existing subnet/NSG
resource "azurerm_network_interface" "training" {
  count               = var.enable_training_vm ? 1 : 0
  name                = "nic-training"
  location            = azurerm_resource_group.backgammon.location
  resource_group_name = azurerm_resource_group.backgammon.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.vm.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.training[0].id
  }
}

# Training VM — Spot instance for cost savings
resource "azurerm_linux_virtual_machine" "training" {
  count               = var.enable_training_vm ? 1 : 0
  name                = "vm-training"
  location            = azurerm_resource_group.backgammon.location
  resource_group_name = azurerm_resource_group.backgammon.name
  size                = var.training_vm_size
  admin_username      = "azureuser"

  network_interface_ids = [
    azurerm_network_interface.training[0].id,
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
}

# ---- Second training VM (8-core) ----

resource "azurerm_public_ip" "training2" {
  count               = var.enable_training_vm_2 ? 1 : 0
  name                = "pip-training2"
  location            = azurerm_resource_group.backgammon.location
  resource_group_name = azurerm_resource_group.backgammon.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_network_interface" "training2" {
  count               = var.enable_training_vm_2 ? 1 : 0
  name                = "nic-training2"
  location            = azurerm_resource_group.backgammon.location
  resource_group_name = azurerm_resource_group.backgammon.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.vm.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.training2[0].id
  }
}

resource "azurerm_linux_virtual_machine" "training2" {
  count               = var.enable_training_vm_2 ? 1 : 0
  name                = "vm-training2"
  location            = azurerm_resource_group.backgammon.location
  resource_group_name = azurerm_resource_group.backgammon.name
  size                = var.training_vm_2_size
  admin_username      = "azureuser"

  network_interface_ids = [
    azurerm_network_interface.training2[0].id,
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
}
