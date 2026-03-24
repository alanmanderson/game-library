terraform {
  required_version = ">= 1.5"

  # Enable remote state for production to support team collaboration and state locking.
  # Without remote state, terraform.tfstate is local-only, risking data loss and conflicts.
  # backend "azurerm" {
  #   resource_group_name  = "rg-pinochle-tfstate"
  #   storage_account_name = "stpinochletfstate"
  #   container_name       = "tfstate"
  #   key                  = "pinochle.tfstate"
  # }

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  subscription_id = var.subscription_id
  features {}
}

resource "azurerm_resource_group" "pinochle" {
  name     = "rg-pinochle"
  location = var.location
}
