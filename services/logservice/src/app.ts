import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import type { Request, Response } from 'express';
import {
  insertEntries,
  queryLogs,
  queryErrorGroups,
  getErrorGroup,
  updateErrorGroup,
  getStats,
} from './db.js';
import {
  LOG_LEVEL_ORDER,
  type LogEntry,
  type LogLevel,
  type ErrorStatus,
} from './types.js';

const API_KEY = process.env.API_KEY ?? '';
const MIN_LEVEL = (process.env.LOG_LEVEL ?? 'warn') as LogLevel;

const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'fatal']);
const VALID_SOURCES = new Set(['frontend', 'backend']);
const VALID_STATUSES = new Set(['open', 'resolved', 'ignored']);

export function createApp(): express.Application {
  const app = express();

  app.use(
    cors({
      origin: (origin, callback) => {
        if (
          !origin ||
          origin.endsWith('.games.alanmanderson.com') ||
          origin.includes('localhost')
        ) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  // --- POST /api/ingest ---
  app.post('/api/ingest', (req: Request, res: Response) => {
    const body = req.body;
    const rawEntries: LogEntry[] = Array.isArray(body?.entries)
      ? body.entries
      : Array.isArray(body)
        ? body
        : [body];

    // Validate and filter
    const valid: LogEntry[] = [];
    for (const entry of rawEntries) {
      if (!entry?.service || !entry?.message || !entry?.level) continue;
      if (!VALID_LEVELS.has(entry.level)) continue;
      if (entry.source && !VALID_SOURCES.has(entry.source)) continue;

      // Check minimum level
      if (
        LOG_LEVEL_ORDER[entry.level as LogLevel] <
        LOG_LEVEL_ORDER[MIN_LEVEL]
      ) {
        continue;
      }

      valid.push({
        service: String(entry.service).slice(0, 100),
        source: (entry.source as 'frontend' | 'backend') ?? 'backend',
        level: entry.level as LogLevel,
        message: String(entry.message).slice(0, 10000),
        error_type: entry.error_type
          ? String(entry.error_type).slice(0, 200)
          : undefined,
        stack_trace: entry.stack_trace
          ? String(entry.stack_trace).slice(0, 20000)
          : undefined,
        context: entry.context,
        user_agent: entry.user_agent
          ? String(entry.user_agent).slice(0, 500)
          : undefined,
        timestamp: entry.timestamp ?? new Date().toISOString(),
      });
    }

    if (valid.length === 0) {
      res.status(400).json({ error: 'No valid entries' });
      return;
    }

    try {
      const accepted = insertEntries(valid);
      res.status(202).json({ accepted });
    } catch (err) {
      console.error('Ingest error:', err);
      res.status(500).json({ error: 'Failed to store entries' });
    }
  });

  // --- GET /api/logs ---
  app.get('/api/logs', requireApiKey, (req: Request, res: Response) => {
    try {
      const logs = queryLogs({
        service: req.query.service as string,
        source: req.query.source as string,
        level: req.query.level as string,
        fingerprint: req.query.fingerprint as string,
        since: req.query.since as string,
        until: req.query.until as string,
        q: req.query.q as string,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      });
      res.json({ logs, count: logs.length });
    } catch (err) {
      console.error('Query logs error:', err);
      res.status(500).json({ error: 'Failed to query logs' });
    }
  });

  // --- GET /api/errors ---
  app.get('/api/errors', requireApiKey, (req: Request, res: Response) => {
    try {
      const errors = queryErrorGroups({
        service: req.query.service as string,
        status: req.query.status as ErrorStatus,
        since: req.query.since as string,
        q: req.query.q as string,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      });
      res.json({ errors, count: errors.length });
    } catch (err) {
      console.error('Query errors error:', err);
      res.status(500).json({ error: 'Failed to query errors' });
    }
  });

  // --- GET /api/errors/:id ---
  app.get('/api/errors/:id', requireApiKey, (req: Request, res: Response) => {
    try {
      const group = getErrorGroup(Number(req.params.id));
      if (!group) {
        res.status(404).json({ error: 'Error group not found' });
        return;
      }

      const logs = queryLogs({
        fingerprint: group.fingerprint,
        limit: 20,
      });

      res.json({ error_group: group, recent_logs: logs });
    } catch (err) {
      console.error('Get error group error:', err);
      res.status(500).json({ error: 'Failed to get error group' });
    }
  });

  // --- PATCH /api/errors/:id ---
  app.patch(
    '/api/errors/:id',
    requireApiKey,
    (req: Request, res: Response) => {
      try {
        const { status, github_issue_url } = req.body;

        if (status && !VALID_STATUSES.has(status)) {
          res.status(400).json({ error: 'Invalid status' });
          return;
        }

        const updated = updateErrorGroup(Number(req.params.id), {
          status,
          github_issue_url,
        });

        if (!updated) {
          res.status(404).json({ error: 'Error group not found' });
          return;
        }

        res.json({ ok: true });
      } catch (err) {
        console.error('Update error group error:', err);
        res.status(500).json({ error: 'Failed to update error group' });
      }
    },
  );

  // --- GET /api/health ---
  app.get('/api/health', (_req: Request, res: Response) => {
    try {
      const stats = getStats();
      res.json({ status: 'ok', ...stats });
    } catch (err) {
      console.error('Health check error:', err);
      res.status(503).json({ status: 'unhealthy' });
    }
  });

  return app;
}

// Constant-time string comparison to prevent timing attacks on API key checks.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Middleware: require API key for read endpoints (ingest is open for frontends)
function requireApiKey(req: Request, res: Response, next: () => void): void {
  if (!API_KEY) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const prefix = 'Bearer ';
  if (
    authHeader &&
    authHeader.startsWith(prefix) &&
    timingSafeEqual(authHeader.slice(prefix.length), API_KEY)
  ) {
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized' });
}
