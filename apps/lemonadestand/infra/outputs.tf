output "api_default_hostname" {
  description = "Default hostname of the API web app"
  value       = azurerm_linux_web_app.api.default_hostname
}

output "api_url" {
  description = "URL of the API web app"
  value       = "https://${azurerm_linux_web_app.api.default_hostname}"
}

output "web_default_hostname" {
  description = "Default hostname of the frontend web app"
  value       = azurerm_linux_web_app.web.default_hostname
}

output "web_url" {
  description = "URL of the frontend web app"
  value       = "https://${azurerm_linux_web_app.web.default_hostname}"
}
