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

The logging service runs on the production VM. Query it via SSH:

```bash
SSH="ssh -o StrictHostKeyChecking=no azureuser@backgammon.alanmanderson.com"
```

The service endpoint on the VM is `http://localhost:3100`. All query endpoints require the API key:

```bash
API_KEY=$(${SSH} "grep LOG_SERVICE_API_KEY /opt/game-library/.env | cut -d= -f2")
AUTH="Authorization: Bearer ${API_KEY}"
```

## Instructions

### Step 1: Query errors

Based on the user's request, query the appropriate endpoint:

**Get all open errors (default):**
```bash
$SSH "curl -sf -H '${AUTH}' 'http://localhost:3100/api/errors?status=open&limit=20'"
```

**Search by keyword:**
```bash
$SSH "curl -sf -H '${AUTH}' 'http://localhost:3100/api/errors?q=SEARCH_TERM&limit=20'"
```

**Filter by service:**
```bash
$SSH "curl -sf -H '${AUTH}' 'http://localhost:3100/api/errors?service=backgammon&status=open'"
```

**Errors from the last 24 hours:**
```bash
SINCE=$(date -u -d '24 hours ago' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -v-24H '+%Y-%m-%dT%H:%M:%SZ')
$SSH "curl -sf -H '${AUTH}' 'http://localhost:3100/api/errors?since=${SINCE}'"
```

**Get detailed error with recent occurrences:**
```bash
$SSH "curl -sf -H '${AUTH}' 'http://localhost:3100/api/errors/ERROR_ID'"
```

**Get raw logs for an error fingerprint:**
```bash
$SSH "curl -sf -H '${AUTH}' 'http://localhost:3100/api/logs?fingerprint=FINGERPRINT&limit=10'"
```

**Health check / overview:**
```bash
$SSH "curl -sf 'http://localhost:3100/api/health'"
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
$SSH "curl -sf -X PATCH 'http://localhost:3100/api/errors/ERROR_ID' \
  -H 'Content-Type: application/json' \
  -H '${AUTH}' \
  -d '{\"github_issue_url\": \"ISSUE_URL\"}'"
```

### Step 4: Manage errors (on user request)

**Resolve an error:**
```bash
$SSH "curl -sf -X PATCH 'http://localhost:3100/api/errors/ERROR_ID' \
  -H 'Content-Type: application/json' \
  -H '${AUTH}' \
  -d '{\"status\": \"resolved\"}'"
```

**Ignore an error:**
```bash
$SSH "curl -sf -X PATCH 'http://localhost:3100/api/errors/ERROR_ID' \
  -H 'Content-Type: application/json' \
  -H '${AUTH}' \
  -d '{\"status\": \"ignored\"}'"
```

## Notes

- Always present findings before creating issues — let the user decide which errors warrant GitHub issues
- The logging service uses SQLite; for large queries, use `limit` and `offset` params
- Error groups with status `resolved` automatically reopen if the same error occurs again
- The `fingerprint` field groups identical errors across occurrences
