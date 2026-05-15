#cloud-config

swap:
  filename: /swapfile
  size: 1073741824
  maxsize: 1073741824

package_update: true

packages:
  - ca-certificates
  - curl

write_files:
  - path: /opt/pinochle/.env
    owner: azureuser:azureuser
    permissions: '0644'
    content: |
      DATABASE_URL=postgresql+asyncpg://pinochleadmin:${db_admin_password}@${db_host}:5432/pinochle?ssl=require
      DATABASE_URL_SYNC=postgresql://pinochleadmin:${db_admin_password}@${db_host}:5432/pinochle?sslmode=require
      SECRET_KEY=${app_secret_key}
      ALLOWED_ORIGINS=https://${domain_name}
      GOOGLE_CLIENT_ID=${google_client_id}
      DOMAIN=${domain_name}

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

  # Create app directory (write_files creates the file but we ensure the dir exists)
  - mkdir -p /opt/pinochle
  - chown -R azureuser:azureuser /opt/pinochle
