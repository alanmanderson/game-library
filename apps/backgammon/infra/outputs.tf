output "vm_public_ip" {
  description = "Public IP address of the VM"
  value       = azurerm_public_ip.backgammon.ip_address
}

output "ssh_command" {
  description = "SSH command to connect to the VM"
  value       = "ssh azureuser@${azurerm_public_ip.backgammon.ip_address}"
}

output "domain_name" {
  description = "Configured domain name"
  value       = var.domain_name
}

output "dns_instructions" {
  description = "DNS configuration instructions"
  value       = "Create an A record: ${var.domain_name} -> ${azurerm_public_ip.backgammon.ip_address}"
}

output "google_client_id" {
  description = "Google OAuth client ID"
  value       = var.google_client_id
}

output "gnubg_private_ip" {
  description = "Private IP address of the gnubg analysis VM (no public IP)"
  value       = azurerm_network_interface.gnubg.private_ip_address
}
