import { getDb } from './db.js';

const RETENTION_DAYS: Record<string, number> = {
  debug: Number(process.env.RETENTION_DAYS_DEBUG ?? 3),
  info: Number(process.env.RETENTION_DAYS_INFO ?? 3),
  warn: Number(process.env.RETENTION_DAYS_WARN ?? 7),
  error: Number(process.env.RETENTION_DAYS_ERROR ?? 30),
  fatal: Number(process.env.RETENTION_DAYS_ERROR ?? 30),
};

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function startRetentionCleanup(): NodeJS.Timeout {
  runCleanup();
  return setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}

function runCleanup(): void {
  const db = getDb();
  let totalDeleted = 0;

  for (const [level, days] of Object.entries(RETENTION_DAYS)) {
    const result = db
      .prepare(
        `DELETE FROM log_entries WHERE level = ? AND created_at < datetime('now', ?)`,
      )
      .run(level, `-${days} days`);
    totalDeleted += result.changes;
  }

  if (totalDeleted > 0) {
    console.log(
      JSON.stringify({
        level: 'info',
        message: `Retention cleanup: deleted ${totalDeleted} old log entries`,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
