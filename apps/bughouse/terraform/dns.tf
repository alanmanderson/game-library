# Custom domain and managed SSL certificate (optional)
# Only created when custom_domain is provided

resource "azurerm_container_app_custom_domain" "main" {
  count                    = var.custom_domain != "" ? 1 : 0
  name                     = var.custom_domain
  container_app_id         = azurerm_container_app.main.id
  certificate_binding_type = "SniEnabled"

  # Note: You must first create a CNAME record pointing your custom domain
  # to the Container App's FQDN, then apply this resource.
  # The managed certificate is automatically provisioned by Azure.

  lifecycle {
    ignore_changes = [certificate_binding_type]
  }
}
