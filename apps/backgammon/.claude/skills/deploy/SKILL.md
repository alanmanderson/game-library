---
name: deploy
description: Deploy to production (backgammon.games.alanmanderson.com) and verify the deployment succeeded with end-to-end checks.
argument-hint: (no arguments needed)
allowed-tools:
  - Bash
  - WebFetch
---

# Deploy to Production

Deploy the backgammon application to production at backgammon.games.alanmanderson.com and verify the deployment succeeded.

## Instructions

### Phase 1: Deploy

Run the deployment script from the project root:

```bash
cd /app && ./deploy.sh
```

This script will:
1. Build the frontend (npm run build with Google client ID from Terraform)
2. Build the backend Docker image for linux/amd64
3. Save and transfer the image + artifacts to the Azure VM
4. SSH into the VM, load the image, run migrations, and restart services

Monitor the output carefully. If any step fails, diagnose the error and report it to the user before continuing.

### Phase 2: Verify Deployment

After the deploy script completes successfully, run the following verification checks against production. Run each check sequentially and report results. Use `curl` for all HTTP checks.

**The production URL is: https://backgammon.games.alanmanderson.com**

#### Check 1: Health endpoint
```bash
curl -sf https://backgammon.games.alanmanderson.com/api/health
```
Expected: `{"status":"healthy"}` with HTTP 200. This confirms the backend is running and the database is connected.

#### Check 2: Homepage loads
```bash
curl -sf -o /dev/null -w '%{http_code}' https://backgammon.games.alanmanderson.com/
```
Expected: HTTP 200. This confirms Caddy is serving the frontend static files.

#### Check 3: Frontend assets are present
```bash
curl -sf https://backgammon.games.alanmanderson.com/ | grep -o 'src="/assets/[^"]*"'
```
Expected: One or more asset references (JS/CSS bundles). This confirms the frontend build was deployed.

#### Check 4: Guest login works
```bash
curl -sf -X POST https://backgammon.games.alanmanderson.com/api/auth/guest \
  -H 'Content-Type: application/json' \
  -d '{"nickname": "deploy-test-bot"}'
```
Expected: JSON response with `token` and `player` fields. This confirms auth endpoints and database writes are working.

#### Check 5: Create a table
Using the token from Check 4:
```bash
curl -sf -X POST https://backgammon.games.alanmanderson.com/api/tables \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN"
```
Expected: JSON response with a `table_id`. This confirms game creation works.

#### Check 6: Invite bot to table
Using the token and table_id from Check 5:
```bash
curl -sf -X POST "https://backgammon.games.alanmanderson.com/api/tables/$TABLE_ID/invite-bot" \
  -H "Authorization: Bearer $TOKEN"
```
Expected: Success response. This confirms the bot opponent feature works.

#### Check 7: WebSocket connectivity
```bash
curl -sf -o /dev/null -w '%{http_code}' \
  --header "Connection: Upgrade" \
  --header "Upgrade: websocket" \
  --header "Sec-WebSocket-Version: 13" \
  --header "Sec-WebSocket-Key: dGVzdA==" \
  "https://backgammon.games.alanmanderson.com/ws/$TABLE_ID/$PLAYER_ID?token=$TOKEN"
```
Expected: HTTP 101 (Switching Protocols). This confirms WebSocket upgrade works through Caddy.

### Phase 3: Report Results

After all checks, provide a summary table:

| Check | Status | Details |
|-------|--------|---------|
| Health endpoint | PASS/FAIL | ... |
| Homepage loads | PASS/FAIL | ... |
| Frontend assets | PASS/FAIL | ... |
| Guest login | PASS/FAIL | ... |
| Table creation | PASS/FAIL | ... |
| Bot invitation | PASS/FAIL | ... |
| WebSocket | PASS/FAIL | ... |

If any checks fail, investigate and suggest fixes. If all pass, confirm the deployment is successful.

### Important Notes

- The deploy script requires SSH access to the Azure VM (key-based auth configured via Terraform)
- Terraform state must be initialized in `/app/infra/`
- The `.env` file on the VM contains production secrets and should already exist from initial setup
- If the deployment fails, do NOT retry automatically — report the error to the user
- The verification guest account ("deploy-test-bot") is ephemeral and safe to create
