---
name: debug-production
description: SSH into the production Azure VM to diagnose live site issues (containers, logs, files, Caddy, database).
argument-hint: [issue description, e.g. "404 on homepage" or "API returning 500"]
allowed-tools:
  - Bash
  - WebFetch
---

# Debug Production Site

SSH into the production VM to diagnose issues with the live site at **https://backgammon.games.alanmanderson.com**.

## SSH Access

You have a trusted SSH key at `~/.ssh/id_ed25519`. Connect with:

```bash
ssh -o StrictHostKeyChecking=no azureuser@backgammon.games.alanmanderson.com "<command>"
```

All commands on the VM should be run via individual SSH calls (not heredocs), e.g.:

```bash
SSH="ssh -o StrictHostKeyChecking=no azureuser@backgammon.games.alanmanderson.com"
$SSH "cd /opt/backgammon && docker compose ps"
```

The application lives at `/opt/backgammon/` on the VM with this layout:

```
/opt/backgammon/
  .env                  # Production secrets (POSTGRES_PASSWORD, JWT_SECRET, GOOGLE_CLIENT_ID, DOMAIN)
  docker-compose.yml    # Production compose file (copied from docker-compose.prod.yml)
  Caddyfile             # Caddy reverse proxy config
  web-dist/             # Frontend static files (index.html, assets/)
```

## Diagnostic Procedure

### Step 1: Check external access

Before SSHing in, check what the outside world sees:

```bash
curl -sI https://backgammon.games.alanmanderson.com/ | head -10
curl -sf https://backgammon.games.alanmanderson.com/api/health
```

### Step 2: Check container status

```bash
$SSH "cd /opt/backgammon && docker compose ps"
```

All three services should be running: `db` (healthy), `fastapi`, `caddy`. If any are missing or restarting, check their logs.

### Step 3: Check logs for the affected service

```bash
# Caddy (reverse proxy / static files) — for 404s, TLS issues, routing problems
$SSH "cd /opt/backgammon && docker compose logs caddy --tail=50"

# FastAPI (backend) — for API errors, WebSocket issues, auth problems
$SSH "cd /opt/backgammon && docker compose logs fastapi --tail=50"

# PostgreSQL — for database errors, connection issues
$SSH "cd /opt/backgammon && docker compose logs db --tail=50"
```

### Step 4: Issue-specific checks

**404 errors / blank page:**
```bash
# Verify frontend files exist and are mounted
$SSH "ls -la /opt/backgammon/web-dist/"
$SSH "cd /opt/backgammon && docker compose exec caddy ls /srv/web/"
# Check Caddyfile and DOMAIN env var
$SSH "cat /opt/backgammon/Caddyfile"
$SSH "grep DOMAIN /opt/backgammon/.env"
```

**API errors (500, auth failures):**
```bash
# Test health endpoint from inside the VM
$SSH "curl -sf http://localhost:8000/api/health"
# Check if fastapi can reach the database
$SSH "cd /opt/backgammon && docker compose exec db pg_isready -U backgammon"
# Check env vars are set
$SSH "grep -c JWT_SECRET /opt/backgammon/.env"
```

**Containers not starting / stale containers:**
```bash
# Force recreate all services
$SSH "cd /opt/backgammon && docker compose up -d --force-recreate"
# Or restart a specific service
$SSH "cd /opt/backgammon && docker compose restart caddy"
```

**Database / migration issues:**
```bash
# Run migrations manually
$SSH "cd /opt/backgammon && docker compose run --rm fastapi alembic upgrade head"
# Check current migration version
$SSH "cd /opt/backgammon && docker compose run --rm fastapi alembic current"
```

### Step 5: Verify the fix

After applying any fix, run the same verification checks as the `/deploy` skill:

```bash
curl -sf https://backgammon.games.alanmanderson.com/api/health
curl -sf -o /dev/null -w '%{http_code}' https://backgammon.games.alanmanderson.com/
curl -sf -X POST https://backgammon.games.alanmanderson.com/api/auth/guest \
  -H 'Content-Type: application/json' \
  -d '{"nickname": "debug-test"}'
```

### Step 6: Report findings

Provide a clear summary:

| Item | Status | Details |
|------|--------|---------|
| Containers | ... | Which are running/stopped |
| Root cause | ... | What caused the issue |
| Fix applied | ... | What was done to resolve it |
| Verification | ... | Whether the site is now working |

## Important Notes

- **Never modify `.env` on the VM** without user approval — it contains production secrets
- **Never run `docker compose down`** without user approval — this stops the live site
- If you need to restart services, prefer `docker compose restart <service>` over full recreate
- The VM user is `azureuser` with sudo access
- Caddy handles TLS automatically — never manually manage certificates
