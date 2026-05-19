# Log Service

Centralized error tracking and logging service for all games in the monorepo. A lightweight alternative to Sentry.

## Tech Stack

- **Runtime**: Node 20, Express, TypeScript
- **Database**: SQLite (better-sqlite3, WAL mode)
- **Port**: 3100
- **Storage**: Docker volume at `/data/logs.db`

## Development

```bash
cd services/logservice
npm install
npm run dev          # Start with hot reload (tsx watch)
npm run build        # Compile TypeScript
npm start            # Run compiled JS
```

## API

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/ingest | None (open for frontends) | Accept log entries |
| GET | /api/errors | API key | Query error groups |
| GET | /api/errors/:id | API key | Error group + recent logs |
| PATCH | /api/errors/:id | API key | Update status, link issue |
| GET | /api/logs | API key | Query raw log entries |
| GET | /api/health | None | Health check with stats |

### Ingest format

```json
{
  "entries": [{
    "service": "backgammon",
    "source": "backend",
    "level": "error",
    "message": "Something broke",
    "error_type": "ValueError",
    "stack_trace": "...",
    "context": {"user_id": "abc"},
    "timestamp": "2025-01-01T00:00:00Z"
  }]
}
```

### Query params

- `service` - filter by game name
- `status` - open, resolved, ignored (errors only)
- `level` - debug, info, warn, error, fatal (logs only)
- `source` - frontend, backend
- `since` / `until` - ISO timestamps
- `q` - search message text
- `fingerprint` - match specific error group
- `limit` / `offset` - pagination (max 200)

## SDKs

Single-file SDKs in `sdk/` are copied into each game:

| File | Stack | Integration |
|------|-------|-------------|
| `sdk/browser.ts` | All JS frontends | `initLogService({ service: 'name' })` in main entry |
| `sdk/python.py` | FastAPI / Flask | `setup_log_service(app, service='name')` |
| `sdk/node.ts` | Express / Fastify | `LogService` class + `expressErrorLogger` middleware |
| `sdk/dotnet.cs` | .NET | `LogServiceClient` + `LogServiceMiddleware` |

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 3100 | Server port |
| `DB_PATH` | ./logs.db | SQLite database path |
| `API_KEY` | (empty) | Bearer token for query endpoints |
| `LOG_LEVEL` | warn | Minimum level to persist |
| `RETENTION_DAYS_DEBUG` | 3 | Days to keep debug/info logs |
| `RETENTION_DAYS_WARN` | 7 | Days to keep warn logs |
| `RETENTION_DAYS_ERROR` | 30 | Days to keep error/fatal logs |

## Architecture

- Errors are deduplicated via fingerprint (SHA-256 of service + error type + normalized message + top stack frame)
- `error_groups` table tracks unique errors with count, first/last seen, status
- `log_entries` table stores all raw log entries
- Resolved errors auto-reopen if the same fingerprint appears again
- Retention cleanup runs hourly via `setInterval`

## Claude Skill

Use `/search-errors` to query errors and create GitHub issues from Claude Code.
