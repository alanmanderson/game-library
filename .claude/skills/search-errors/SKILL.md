---
name: search-errors
description: Search error logs from the centralized logging service, analyze patterns, and optionally create GitHub issues.
argument-hint: [search query, service name, or "recent" for latest errors]
allowed-tools:
  - Bash
---

# Search Error Logs

Search the centralized logging service for errors across all games and optionally create GitHub issues.

## Connection

The logging service runs inside Docker on the production VM. It is only reachable via the Docker network (port 3100 is not exposed to the host), so all queries go through `docker exec`.

```bash
SSH="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null azureuser@games.alanmanderson.com"
```

Get the API key from the production env file:

```bash
API_KEY=$($SSH "grep LOG_SERVICE_API_KEY /opt/gamelibrary/infra/.env | cut -d= -f2")
```

All query commands use `docker exec` + `wget` (curl is not installed in the container). The SSH stderr warning must be filtered out when piping to JSON parsers:

```bash
QUERY() {
  $SSH "docker exec infra-logservice-1 wget -qO- --header 'Authorization: Bearer ${API_KEY}' 'http://localhost:3100$1'" 2>&1 | grep -v "^Warning:"
}
```

## Instructions

### Step 1: Query errors

Based on the user's request, query the appropriate endpoint:

**Health check / overview:**
```bash
$SSH "docker exec infra-logservice-1 wget -qO- 'http://localhost:3100/api/health'" 2>&1 | grep -v "^Warning:"
```

**Get all open errors (default):**
```bash
QUERY '/api/errors?status=open&limit=20'
```

**Search by keyword:**
```bash
QUERY '/api/errors?q=SEARCH_TERM&limit=20'
```

**Filter by service:**
```bash
QUERY '/api/errors?service=backgammon&status=open'
```

**Query raw logs (warn and above):**
```bash
QUERY '/api/logs?limit=100&level=warn'
```

**Get detailed error with recent occurrences:**
```bash
QUERY '/api/errors/ERROR_ID'
```

**Get raw logs for an error fingerprint:**
```bash
QUERY '/api/logs?fingerprint=FINGERPRINT&limit=10'
```

### Step 2: Present findings

Summarize the errors in a clear table:

| # | Service | Error Type | Message | Count | First Seen | Last Seen | Status |
|---|---------|------------|---------|-------|------------|-----------|--------|

Group related errors and highlight patterns (e.g., "3 errors in backgammon WebSocket handling in the last 2 hours").

### Step 3: Create GitHub issues (on user request)

For each error the user wants to file:

```bash
gh issue create --repo alanmanderson/game-library \
  --title "Bug: [service] - concise error description" \
  --body "$(cat <<'ISSUE_EOF'
## Error Details

- **Service**: SERVICE_NAME
- **Source**: frontend/backend
- **Error Type**: ERROR_TYPE
- **First Seen**: TIMESTAMP
- **Last Seen**: TIMESTAMP
- **Occurrences**: COUNT

## Message

```
ERROR_MESSAGE
```

## Stack Trace

```
STACK_TRACE
```

## Context

Additional context from log entries.

---
*Auto-generated from error tracking (fingerprint: `FINGERPRINT`)*
ISSUE_EOF
)" --label "bug"
```

Then link the issue back to the error group:

```bash
$SSH "docker exec infra-logservice-1 wget -qO- --method PATCH --body-data '{\"github_issue_url\": \"ISSUE_URL\"}' --header 'Content-Type: application/json' --header 'Authorization: Bearer ${API_KEY}' 'http://localhost:3100/api/errors/ERROR_ID'" 2>&1 | grep -v "^Warning:"
```

### Step 4: Manage errors (on user request)

**Resolve an error:**
```bash
$SSH "docker exec infra-logservice-1 wget -qO- --method PATCH --body-data '{\"status\": \"resolved\"}' --header 'Content-Type: application/json' --header 'Authorization: Bearer ${API_KEY}' 'http://localhost:3100/api/errors/ERROR_ID'" 2>&1 | grep -v "^Warning:"
```

**Ignore an error:**
```bash
$SSH "docker exec infra-logservice-1 wget -qO- --method PATCH --body-data '{\"status\": \"ignored\"}' --header 'Content-Type: application/json' --header 'Authorization: Bearer ${API_KEY}' 'http://localhost:3100/api/errors/ERROR_ID'" 2>&1 | grep -v "^Warning:"
```

## Notes

- Always present findings before creating issues — let the user decide which errors warrant GitHub issues
- The logging service uses SQLite; for large queries, use `limit` and `offset` params
- Error groups with status `resolved` automatically reopen if the same error occurs again
- The `fingerprint` field groups identical errors across occurrences
- Port 3100 is only accessible within Docker network — always use `docker exec infra-logservice-1`
- Filter `grep -v "^Warning:"` from SSH output before piping to JSON parsers
