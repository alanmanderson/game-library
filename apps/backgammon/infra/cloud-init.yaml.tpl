#cloud-config

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

  # Create app directory
  - mkdir -p /opt/backgammon

  # Write .env file
  - |
    cat > /opt/backgammon/.env << 'ENVEOF'
    DATABASE_URL=postgresql+asyncpg://${db_admin_login}:${db_admin_password}@${db_host}:5432/${db_name}?ssl=require
    DATABASE_URL_SYNC=postgresql://${db_admin_login}:${db_admin_password}@${db_host}:5432/${db_name}?sslmode=require
    JWT_SECRET=${app_secret_key}
    ALLOWED_ORIGINS=https://${domain_name}
    GOOGLE_CLIENT_ID=${google_client_id}
    DOMAIN=${domain_name}
    ENVEOF
  - sed -i 's/^[[:space:]]*//' /opt/backgammon/.env

  - chown -R azureuser:azureuser /opt/backgammon
