import { createApp } from './app.js';
import { startRetentionCleanup } from './retention.js';
import { getDb } from './db.js';

const PORT = Number(process.env.PORT ?? 3100);

const app = createApp();

// Initialize database on startup
getDb();

// Start retention cleanup schedule
const cleanupTimer = startRetentionCleanup();

const server = app.listen(PORT, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: `Log service started on port ${PORT}`,
      port: PORT,
      timestamp: new Date().toISOString(),
    }),
  );
});

// Graceful shutdown
function shutdown(signal: string): void {
  console.log(
    JSON.stringify({
      level: 'info',
      message: `Received ${signal}, shutting down`,
      timestamp: new Date().toISOString(),
    }),
  );
  clearInterval(cleanupTimer);
  server.close(() => {
    try {
      getDb().close();
    } catch {
      // already closed
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
