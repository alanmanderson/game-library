#!/usr/bin/env bash
set -euo pipefail

# Deploy backgammon to Azure VM
# Usage: ./deploy.sh [user@host]
#
# Reads VM address from terraform output if not provided.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REMOTE="${1:-}"

if [ -z "$REMOTE" ]; then
    IP=$(cd "$SCRIPT_DIR/infra" && terraform output -raw vm_public_ip)
    REMOTE="azureuser@$IP"
fi

echo "==> Deploying to $REMOTE"

# 1. Build web client
echo "==> Building web client..."
GOOGLE_CID=$(cd "$SCRIPT_DIR/infra" && terraform output -raw google_client_id 2>/dev/null || echo "")
(cd "$SCRIPT_DIR/frontend" && VITE_GOOGLE_CLIENT_ID="$GOOGLE_CID" npm run build)

# 2. Build Docker image
echo "==> Building Docker image..."
docker build --platform linux/amd64 -t backgammon-server:latest -f "$SCRIPT_DIR/backend/Dockerfile" "$SCRIPT_DIR"

# 3. Save Docker image as tarball
echo "==> Saving Docker image..."
docker save backgammon-server:latest | gzip > /tmp/backgammon-server.tar.gz

# 4. Transfer artifacts to VM
echo "==> Transferring files to VM..."
scp /tmp/backgammon-server.tar.gz "$REMOTE":/tmp/
scp "$SCRIPT_DIR/docker-compose.prod.yml" "$REMOTE":/opt/backgammon/docker-compose.yml
scp "$SCRIPT_DIR/Caddyfile" "$REMOTE":/opt/backgammon/

# Transfer web build
ssh "$REMOTE" "rm -rf /opt/backgammon/web-dist"
scp -r "$SCRIPT_DIR/frontend/dist" "$REMOTE":/opt/backgammon/web-dist

# 5. Tag current image as :previous for rollback
echo "==> Tagging current image as :previous for rollback..."
ssh "$REMOTE" "docker tag backgammon-server:latest backgammon-server:previous 2>/dev/null || true"

# 6. Load image and restart services on VM
echo "==> Loading image and starting services..."
ssh "$REMOTE" bash -s <<'EOF'
set -euo pipefail
cd /opt/backgammon

# Ensure .env file exists with required variables
if [ ! -f .env ]; then
  echo "Creating .env with default values..."
  cat > .env <<'ENVFILE'
POSTGRES_PASSWORD=changeme-generate-a-secure-random-string
JWT_SECRET=changeme-generate-a-secure-random-string
GOOGLE_CLIENT_ID=
DOMAIN=
ENVFILE
  echo "WARNING: Edit /opt/backgammon/.env with real secrets before production use!"
fi

# Load Docker image
docker load < /tmp/backgammon-server.tar.gz
rm /tmp/backgammon-server.tar.gz

# Run Alembic migrations
echo "Running migrations..."
docker compose run --rm fastapi alembic upgrade head

# Start/restart all services
docker compose up -d --force-recreate

echo "==> Deployment complete!"
EOF

# 7. Health check with auto-rollback on failure
COMPOSE="/opt/backgammon/docker-compose.yml"
echo "==> Verifying deployment..."
sleep 5
if ! ssh "$REMOTE" "curl -sf http://localhost:8000/api/health > /dev/null"; then
    echo "ERROR: Health check failed! Rolling back..."
    ssh "$REMOTE" "docker tag backgammon-server:previous backgammon-server:latest && cd /opt/backgammon && docker compose down && docker compose up -d"
    echo "==> Rolled back to previous version."
    exit 1
fi
echo "==> Health check passed."

echo "==> Done. Visit https://$(cd "$SCRIPT_DIR/infra" && terraform output -raw domain_name 2>/dev/null || echo '<your-domain>')"
