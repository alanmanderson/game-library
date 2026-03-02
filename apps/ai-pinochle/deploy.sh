#!/usr/bin/env bash
set -euo pipefail

# Deploy ai-pinochle to Azure VM
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
(cd "$SCRIPT_DIR/web" && npm run build)

# 2. Build Docker image
echo "==> Building Docker image..."
docker build --platform linux/amd64 -t pinochle-server:latest "$SCRIPT_DIR"

# 3. Save Docker image as tarball
echo "==> Saving Docker image..."
docker save pinochle-server:latest | gzip > /tmp/pinochle-server.tar.gz

# 4. Transfer artifacts to VM
echo "==> Transferring files to VM..."
scp /tmp/pinochle-server.tar.gz "$REMOTE":/tmp/
scp "$SCRIPT_DIR/docker-compose.yml" "$REMOTE":/opt/pinochle/
scp "$SCRIPT_DIR/Caddyfile" "$REMOTE":/opt/pinochle/

# Transfer web build
ssh "$REMOTE" "rm -rf /opt/pinochle/web-dist"
scp -r "$SCRIPT_DIR/web/dist" "$REMOTE":/opt/pinochle/web-dist

# 5. Load image and restart services on VM
echo "==> Loading image and starting services..."
ssh "$REMOTE" bash -s <<'EOF'
set -euo pipefail
cd /opt/pinochle

# Load Docker image
docker load < /tmp/pinochle-server.tar.gz
rm /tmp/pinochle-server.tar.gz

# Start/restart services
docker compose up -d --force-recreate

# Wait for FastAPI to be ready
echo "Waiting for FastAPI..."
for i in $(seq 1 30); do
    if docker compose exec fastapi python -c "print('ok')" 2>/dev/null; then
        echo "FastAPI is ready."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "ERROR: FastAPI failed to start. Check logs: docker compose logs fastapi"
        exit 1
    fi
    sleep 3
done

# Run Alembic migrations (Alembic needs sync psycopg2 URL, not asyncpg)
echo "Running migrations..."
docker compose exec fastapi bash -c 'DATABASE_URL=$DATABASE_URL_SYNC alembic upgrade head'

echo "==> Deployment complete!"
EOF

echo "==> Done. Visit https://$(cd "$SCRIPT_DIR/infra" && terraform output -raw domain_name 2>/dev/null || echo '<your-domain>')"
