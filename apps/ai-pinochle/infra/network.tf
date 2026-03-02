resource "azurerm_virtual_network" "pinochle" {
  name                = "vnet-pinochle"
  location            = azurerm_resource_group.pinochle.location
  resource_group_name = azurerm_resource_group.pinochle.name
  address_space       = ["10.0.0.0/16"]
}

# Subnet for the VM
resource "azurerm_subnet" "vm" {
  name                 = "snet-vm"
  resource_group_name  = azurerm_resource_group.pinochle.name
  virtual_network_name = azurerm_virtual_network.pinochle.name
  address_prefixes     = ["10.0.1.0/24"]
}

# Delegated subnet for PostgreSQL Flexible Server
resource "azurerm_subnet" "postgres" {
  name                 = "snet-postgres"
  resource_group_name  = azurerm_resource_group.pinochle.name
  virtual_network_name = azurerm_virtual_network.pinochle.name
  address_prefixes     = ["10.0.2.0/24"]

  delegation {
    name = "postgres-delegation"
    service_delegation {
      name = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action",
      ]
    }
  }
}

# Network Security Group — allow SSH, HTTP, HTTPS
resource "azurerm_network_security_group" "pinochle" {
  name                = "nsg-pinochle"
  location            = azurerm_resource_group.pinochle.location
  resource_group_name = azurerm_resource_group.pinochle.name

  security_rule {
    name                       = "SSH"
    priority                   = 1001
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "HTTP"
    priority                   = 1002
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "HTTPS"
    priority                   = 1003
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

resource "azurerm_subnet_network_security_group_association" "vm" {
  subnet_id                 = azurerm_subnet.vm.id
  network_security_group_id = azurerm_network_security_group.pinochle.id
}

# Static public IP for the VM
resource "azurerm_public_ip" "pinochle" {
  name                = "pip-pinochle"
  location            = azurerm_resource_group.pinochle.location
  resource_group_name = azurerm_resource_group.pinochle.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

# Network interface for the VM
resource "azurerm_network_interface" "pinochle" {
  name                = "nic-pinochle"
  location            = azurerm_resource_group.pinochle.location
  resource_group_name = azurerm_resource_group.pinochle.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.vm.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.pinochle.id
  }
}
