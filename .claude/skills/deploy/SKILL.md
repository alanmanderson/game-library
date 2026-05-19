---
name: deploy
description: Deploy services to the production VM. Syncs code, rebuilds Docker containers, and verifies health.
argument-hint: [service name(s), "all", or blank for auto-detect from git diff]
allowed-tools:
  - Bash
  - Read
  - Grep
---

# Deploy to Production VM

Deploy one or more services to the centralized game library VM at `20.83.116.73`.

## Connection

```bash
SSH="ssh -o StrictHostKeyChecking=no -i /home/claude/.ssh/id_rsa azureuser@20.83.116.73"
SCP="scp -o StrictHostKeyChecking=no -i /home/claude/.ssh/id_rsa"
```

VM layout:
- Code: `/opt/gamelibrary/` (apps/, infra/, services/)
- Env: `/opt/gamelibrary/infra/.env`
- Compose: `/opt/gamelibrary/infra/docker-compose.yml`

## Valid service names

Game services: `ai-pinochle`, `backgammon`, `bughouse`, `forbidden-island`, `lemonadestand`, `spades`, `telestrations`
Infrastructure: `logservice`, `caddy`, `postgres`, `gnubg`
Special: `all` (rebuilds all game services), `infra` (Caddyfile + compose only)

Note: `backgammon` should always be deployed alongside `gnubg` since they're tightly coupled.

## Instructions

### Step 1: Determine what to deploy

If the user specified service(s), use those. Otherwise, auto-detect from the git diff against what's on main:

```bash
# See what changed since last deploy
git log --oneline origin/main..HEAD --name-only | grep -E '^apps/|^infra/|^services/' | sort -u
```

Map changed paths to services:
- `apps/backgammon/**` → `gnubg backgammon`
- `apps/ai-pinochle/**` → `ai-pinochle`
- `apps/bughouse/**` → `bughouse`
- `apps/forbidden-island/**` → `forbidden-island`
- `apps/lemonadestand/**` → `lemonadestand`
- `apps/spades/**` → `spades`
- `apps/telestrations/**` → `telestrations`
- `services/logservice/**` → `logservice`
- `infra/Caddyfile` → Caddy reload (no rebuild)
- `infra/docker-compose.yml` → affected services need restart

### Step 2: Sync code to the VM

Create a tarball of the repo (excluding build artifacts) and transfer:

```bash
cd /app
tar czf /tmp/gamelibrary-deploy.tar.gz \
  --exclude='node_modules' --exclude='.git' \
  --exclude='__pycache__' --exclude='.venv' \
  --exclude='*.pyc' --exclude='dist' \
  --exclude='build' --exclude='bin' --exclude='obj' \
  --exclude='.env' --exclude='*.db' \
  apps/ infra/ services/

$SCP /tmp/gamelibrary-deploy.tar.gz azureuser@20.83.116.73:/tmp/
$SSH "tar xzf /tmp/gamelibrary-deploy.tar.gz -C /opt/gamelibrary"
```

### Step 3: Set GIT_SHA

```bash
GIT_SHA=$(git rev-parse HEAD)
$SSH "cd /opt/gamelibrary/infra && sed -i '/^GIT_SHA=/d' .env && echo 'GIT_SHA=${GIT_SHA}' >> .env"
```

### Step 4: Build and restart services

For game/logservice containers (replace SERVICES with the space-separated list):

```bash
$SSH "cd /opt/gamelibrary/infra && docker compose build SERVICES && docker compose up -d SERVICES"
```

For Caddyfile changes (reload without restart to preserve TLS state):

```bash
$SSH "cd /opt/gamelibrary/infra && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile"
```

For docker-compose.yml changes only (no code changes, just config):

```bash
$SSH "cd /opt/gamelibrary/infra && docker compose up -d SERVICES"
```

### Step 5: Verify deployment

Wait a few seconds, then check all containers are healthy:

```bash
$SSH "cd /opt/gamelibrary/infra && docker compose ps --format 'table {{.Name}}\t{{.Status}}'"
```

Check for crash-looping containers:

```bash
RESTARTING=$($SSH "docker ps --format '{{.Names}} {{.Status}}' | grep Restarting || true")
if [ -n "$RESTARTING" ]; then
  echo "WARNING: Containers are crash-looping: $RESTARTING"
fi
```

Hit health endpoints for deployed services:

```bash
# Map service names to their health URLs
# ai-pinochle   → https://pinochle.games.alanmanderson.com/api/health
# backgammon    → https://backgammon.games.alanmanderson.com/api/health
# bughouse      → https://bughouse.games.alanmanderson.com/api/health
# forbidden-island → https://fi.games.alanmanderson.com/api/health
# lemonadestand → https://lemonade.games.alanmanderson.com/api/health
# spades        → https://spades.games.alanmanderson.com/api/health
# telestrations → https://telestrations.games.alanmanderson.com/api/health
# logservice    → https://logs.games.alanmanderson.com/api/health

curl -sf https://SUBDOMAIN.games.alanmanderson.com/api/health
```

### Step 6: Report

Present a summary table:

| Service | Build | Restart | Health | Notes |
|---------|-------|---------|--------|-------|
| ... | ... | ... | ... | ... |

If any container is crash-looping, check its logs:

```bash
$SSH "cd /opt/gamelibrary/infra && docker compose logs SERVICE --tail=30"
```

## Rollback

If a deploy goes bad, roll back to the previous image:

```bash
# Check recent images
$SSH "docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.CreatedAt}}' | head -20"

# Restart with previous image (docker compose up -d will use whatever's tagged :latest)
# To truly rollback, re-sync the old code and rebuild:
$SSH "cd /opt/gamelibrary/infra && git log --oneline -5"  # won't work (not a git repo)
```

The simplest rollback is to re-deploy from the previous commit locally:
```bash
git checkout HEAD~1
# Then re-run this deploy skill
```

## Notes

- The VM does NOT have a git clone — code is synced via tar/scp
- Docker builds happen on the VM (not locally), so builds use the VM's Docker cache
- The `.env` file on the VM contains production secrets — never overwrite it
- Caddy handles TLS automatically — never manually manage certificates
- `backgammon` always pairs with `gnubg` (the AI engine runs as a separate container)
- Build times vary: Python apps ~1-2min, Node apps ~2-3min, .NET ~3-5min
