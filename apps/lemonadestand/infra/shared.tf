# Look up shared App Service Plan (created by backgammon infra)

data "azurerm_service_plan" "shared" {
  name                = "plan-shared"
  resource_group_name = "rg-shared"
}
