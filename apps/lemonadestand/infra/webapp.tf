resource "azurerm_linux_web_app" "api" {
  name                = "api-lemonadestand"
  location            = azurerm_resource_group.lemonadestand.location
  resource_group_name = azurerm_resource_group.lemonadestand.name
  service_plan_id     = data.azurerm_service_plan.shared.id

  site_config {
    always_on = true

    application_stack {
      dotnet_version = "8.0"
    }
  }

  app_settings = {
    ASPNETCORE_ENVIRONMENT = "Production"
    ASPNETCORE_URLS        = "http://+:8080"
  }
}

resource "azurerm_linux_web_app" "web" {
  name                = "app-lemonadestand-web"
  location            = azurerm_resource_group.lemonadestand.location
  resource_group_name = azurerm_resource_group.lemonadestand.name
  service_plan_id     = data.azurerm_service_plan.shared.id

  site_config {
    application_stack {
      node_version = "20-lts"
    }
  }
}
