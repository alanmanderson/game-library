terraform {
  required_version = ">= 1.5"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.80" # Note: AzureRM 4.x is available but may contain breaking changes
    }
  }

  # IMPORTANT: Configure a remote backend before production use.
  # Local state is not safe for team collaboration or CI/CD.
  # backend "azurerm" {
  #   resource_group_name  = "rg-tfstate"
  #   storage_account_name = "stbughousestate"
  #   container_name       = "tfstate"
  #   key                  = "bughouse.tfstate"
  # }
}

provider "azurerm" {
  features {}
  subscription_id = "1a020407-3f63-418b-91be-af42a0a2cfef"
}
