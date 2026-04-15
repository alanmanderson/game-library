#cloud-config

# Minimal host bootstrap for vm-gnubg. No database credentials — the
# gnubg service talks to nothing except the callers that reach it over
# the VNet.

swap:
  filename: /swapfile
  size: 1073741824
  maxsize: 1073741824

package_update: true

packages:
  - ca-certificates
  - curl

runcmd:
  # Install Docker (official method)
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  - chmod a+r /etc/apt/keyrings/docker.asc
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  - systemctl enable docker
  - usermod -aG docker azureuser

  # Create service directory
  - mkdir -p /opt/gnubg
  - chown -R azureuser:azureuser /opt/gnubg
