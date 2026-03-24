resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${local.resource_prefix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = 30

  tags = {
    project     = var.project_name
    environment = var.environment
  }
}

resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${local.resource_prefix}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  infrastructure_subnet_id   = azurerm_subnet.container_apps.id

  tags = {
    project     = var.project_name
    environment = var.environment
  }
}

locals {
  db_connection_string = "postgresql+asyncpg://${azurerm_postgresql_flexible_server.main.administrator_login}:${var.db_admin_password}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/${var.project_name}?ssl=require"
  image_name           = "${azurerm_container_registry.main.login_server}/${var.project_name}:${var.container_image_tag}"
  google_redirect_uri  = var.custom_domain != "" ? "https://${var.custom_domain}/api/auth/google/callback" : "https://${azurerm_container_app.main.ingress[0].fqdn}/api/auth/google/callback"
}

resource "azurerm_container_app" "main" {
  name                         = "ca-${local.resource_prefix}"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"

  secret {
    name  = "db-url"
    value = local.db_connection_string
  }

  secret {
    name  = "jwt-secret"
    value = var.jwt_secret_key
  }

  secret {
    name  = "google-client-secret"
    value = var.google_client_secret
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.main.admin_password
  }

  registry {
    server               = azurerm_container_registry.main.login_server
    username             = azurerm_container_registry.main.admin_username
    password_secret_name = "acr-password"
  }

  template {
    min_replicas = 1
    max_replicas = 1 # Single replica for in-memory game state correctness

    container {
      name   = var.project_name
      image  = local.image_name
      cpu    = 0.5
      memory = "1Gi"

      env {
        name        = "BUGHOUSE_DATABASE_URL"
        secret_name = "db-url"
      }

      env {
        name        = "BUGHOUSE_JWT_SECRET_KEY"
        secret_name = "jwt-secret"
      }

      env {
        name  = "BUGHOUSE_GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }

      env {
        name        = "BUGHOUSE_GOOGLE_CLIENT_SECRET"
        secret_name = "google-client-secret"
      }

      env {
        name  = "BUGHOUSE_GOOGLE_REDIRECT_URI"
        value = local.google_redirect_uri
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = 8000
    transport        = "auto"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  tags = {
    project     = var.project_name
    environment = var.environment
  }
}
