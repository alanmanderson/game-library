#!/usr/bin/env bash
set -euo pipefail

# Rollback backgammon deployment to the previous Docker image
# Usage: ./rollback.sh [user@host]
#
# Reads VM address from terraform output if not provided.
# Requires that a previous deployment tagged backgammon-server:previous.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REMOTE="${1:-}"

if [ -z "$REMOTE" ]; then
    IP=$(cd "$SCRIPT_DIR/infra" && terraform output -raw vm_public_ip)
    REMOTE="azureuser@$IP"
fi

COMPOSE="/opt/backgammon/docker-compose.yml"

echo "==> Rolling back deployment on $REMOTE"

# Check that a previous image exists
echo "==> Checking for previous image..."
if ! ssh "$REMOTE" "docker image inspect backgammon-server:previous > /dev/null 2>&1"; then
    echo "ERROR: No previous image found (backgammon-server:previous). Cannot rollback."
    exit 1
fi

# Swap previous image to latest and restart
echo "==> Restoring previous image..."
ssh "$REMOTE" bash -s <<EOF
set -euo pipefail
cd /opt/backgammon

# Tag previous as latest
docker tag backgammon-server:previous backgammon-server:latest

# Restart services with the restored image
docker compose down
docker compose up -d
EOF

# Health check
echo "==> Verifying rollback..."
sleep 5
if ssh "$REMOTE" "curl -sf http://localhost:8000/api/health > /dev/null"; then
    echo "==> Rollback successful! Health check passed."
else
    echo "WARNING: Health check failed after rollback. Manual intervention may be required."
    exit 1
fi

echo "==> Done. Rolled back to previous version on $REMOTE"
