import Database from 'better-sqlite3';
import type {
  LogEntry,
  StoredLogEntry,
  ErrorGroup,
  ErrorStatus,
} from './types.js';
import { computeFingerprint } from './fingerprint.js';

const DB_PATH = process.env.DB_PATH ?? './logs.db';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS log_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      service TEXT NOT NULL,
      source TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      error_type TEXT,
      stack_trace TEXT,
      fingerprint TEXT,
      context TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_log_entries_service ON log_entries(service);
    CREATE INDEX IF NOT EXISTS idx_log_entries_level ON log_entries(level);
    CREATE INDEX IF NOT EXISTS idx_log_entries_timestamp ON log_entries(timestamp);
    CREATE INDEX IF NOT EXISTS idx_log_entries_fingerprint ON log_entries(fingerprint);

    CREATE TABLE IF NOT EXISTS error_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL UNIQUE,
      service TEXT NOT NULL,
      source TEXT NOT NULL,
      error_type TEXT NOT NULL,
      message TEXT NOT NULL,
      stack_trace TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      github_issue_url TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_error_groups_status ON error_groups(status);
    CREATE INDEX IF NOT EXISTS idx_error_groups_service ON error_groups(service);
    CREATE INDEX IF NOT EXISTS idx_error_groups_last_seen ON error_groups(last_seen);
  `);
}

// --- Insert ---

const insertLogStmt = () =>
  getDb().prepare(`
  INSERT INTO log_entries (timestamp, service, source, level, message, error_type, stack_trace, fingerprint, context, user_agent)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const upsertErrorGroupStmt = () =>
  getDb().prepare(`
  INSERT INTO error_groups (fingerprint, service, source, error_type, message, stack_trace, first_seen, last_seen, count)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  ON CONFLICT(fingerprint) DO UPDATE SET
    last_seen = excluded.last_seen,
    count = error_groups.count + 1,
    stack_trace = COALESCE(excluded.stack_trace, error_groups.stack_trace),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    status = CASE WHEN error_groups.status = 'resolved' THEN 'open' ELSE error_groups.status END
`);

export function insertEntries(entries: LogEntry[]): number {
  const db = getDb();
  const insert = insertLogStmt();
  const upsertError = upsertErrorGroupStmt();
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    let count = 0;
    for (const entry of entries) {
      const ts = entry.timestamp ?? now;
      const errorType = entry.error_type ?? null;
      const stackTrace = entry.stack_trace ?? null;
      const contextStr = entry.context ? JSON.stringify(entry.context) : null;
      const userAgent = entry.user_agent ?? null;

      let fingerprint: string | null = null;
      if (entry.level === 'error' || entry.level === 'fatal') {
        fingerprint = computeFingerprint(
          entry.service,
          errorType ?? 'Error',
          entry.message,
          stackTrace ?? undefined,
        );

        upsertError.run(
          fingerprint,
          entry.service,
          entry.source,
          errorType ?? 'Error',
          entry.message.slice(0, 500),
          stackTrace,
          ts,
          ts,
        );
      }

      insert.run(
        ts,
        entry.service,
        entry.source,
        entry.level,
        entry.message,
        errorType,
        stackTrace,
        fingerprint,
        contextStr,
        userAgent,
      );
      count++;
    }
    return count;
  });

  return tx();
}

// --- Query logs ---

export function queryLogs(params: {
  service?: string;
  source?: string;
  level?: string;
  fingerprint?: string;
  since?: string;
  until?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): StoredLogEntry[] {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.service) {
    conditions.push('service = ?');
    values.push(params.service);
  }
  if (params.source) {
    conditions.push('source = ?');
    values.push(params.source);
  }
  if (params.level) {
    conditions.push('level = ?');
    values.push(params.level);
  }
  if (params.fingerprint) {
    conditions.push('fingerprint = ?');
    values.push(params.fingerprint);
  }
  if (params.since) {
    conditions.push('timestamp >= ?');
    values.push(params.since);
  }
  if (params.until) {
    conditions.push('timestamp <= ?');
    values.push(params.until);
  }
  if (params.q) {
    conditions.push('message LIKE ?');
    values.push(`%${params.q}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const rows = getDb()
    .prepare(
      `SELECT * FROM log_entries ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    )
    .all(...values, limit, offset) as StoredLogEntry[];

  return rows.map((r) => ({
    ...r,
    context: r.context ? JSON.parse(r.context as unknown as string) : null,
  }));
}

// --- Query error groups ---

export function queryErrorGroups(params: {
  service?: string;
  status?: ErrorStatus;
  since?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): ErrorGroup[] {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.service) {
    conditions.push('service = ?');
    values.push(params.service);
  }
  if (params.status) {
    conditions.push('status = ?');
    values.push(params.status);
  }
  if (params.since) {
    conditions.push('last_seen >= ?');
    values.push(params.since);
  }
  if (params.q) {
    conditions.push('(message LIKE ? OR error_type LIKE ?)');
    values.push(`%${params.q}%`, `%${params.q}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  return getDb()
    .prepare(
      `SELECT * FROM error_groups ${where} ORDER BY last_seen DESC LIMIT ? OFFSET ?`,
    )
    .all(...values, limit, offset) as ErrorGroup[];
}

export function getErrorGroup(id: number): ErrorGroup | undefined {
  return getDb()
    .prepare('SELECT * FROM error_groups WHERE id = ?')
    .get(id) as ErrorGroup | undefined;
}

export function updateErrorGroup(
  id: number,
  update: { status?: ErrorStatus; github_issue_url?: string },
): boolean {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (update.status) {
    sets.push('status = ?');
    values.push(update.status);
  }
  if (update.github_issue_url !== undefined) {
    sets.push('github_issue_url = ?');
    values.push(update.github_issue_url);
  }
  if (sets.length === 0) return false;

  sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
  values.push(id);

  const result = getDb()
    .prepare(`UPDATE error_groups SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);

  return result.changes > 0;
}

// --- Stats ---

export function getStats(): {
  entries_count: number;
  errors_count: number;
  open_errors: number;
  db_size_bytes: number;
} {
  const d = getDb();
  const entries = d
    .prepare('SELECT COUNT(*) as c FROM log_entries')
    .get() as { c: number };
  const errors = d
    .prepare('SELECT COUNT(*) as c FROM error_groups')
    .get() as { c: number };
  const open = d
    .prepare("SELECT COUNT(*) as c FROM error_groups WHERE status = 'open'")
    .get() as { c: number };

  let dbSize = 0;
  try {
    const stat = d
      .prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")
      .get() as { size: number } | undefined;
    dbSize = stat?.size ?? 0;
  } catch {
    // pragma may not be available
  }

  return {
    entries_count: entries.c,
    errors_count: errors.c,
    open_errors: open.c,
    db_size_bytes: dbSize,
  };
}
