/**
 * Browser SDK for the centralized logging service.
 * Captures unhandled errors and unhandled promise rejections automatically.
 * Provides manual logging methods for explicit error reporting.
 *
 * Usage:
 *   import { initLogService, logService } from './logservice';
 *   initLogService({ service: 'backgammon' });
 *   logService.error('Something broke', { userId: '123' });
 */

interface LogServiceConfig {
  service: string;
  endpoint?: string;
  minLevel?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
}

interface LogEntry {
  service: string;
  source: 'frontend';
  level: string;
  message: string;
  error_type?: string;
  stack_trace?: string;
  context?: Record<string, unknown>;
  user_agent: string;
  timestamp: string;
}

const LEVEL_ORDER: Record<string, number> = {
  debug: 0, info: 1, warn: 2, error: 3, fatal: 4,
};

let config: LogServiceConfig | null = null;
let buffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_INTERVAL = 5000;
const MAX_BUFFER = 10;

function isDev(): boolean {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function getEndpoint(): string {
  if (config?.endpoint) return config.endpoint;
  const proto = window.location.protocol;
  const hostParts = window.location.hostname.split('.');
  // Replace game subdomain with 'logs': backgammon.games.example.com -> logs.games.example.com
  if (hostParts.length >= 3) {
    hostParts[0] = 'logs';
    return `${proto}//${hostParts.join('.')}${window.location.port ? ':' + window.location.port : ''}/api/ingest`;
  }
  return `${proto}//${window.location.host}/api/ingest`;
}

function flush(): void {
  if (buffer.length === 0) return;
  const entries = buffer.splice(0);
  const payload = JSON.stringify({ entries });

  if (isDev()) {
    for (const e of entries) {
      const fn = e.level === 'error' || e.level === 'fatal' ? 'error' : e.level === 'warn' ? 'warn' : 'log';
      console[fn](`[logservice:${e.service}]`, e.message, e.context ?? '');
    }
    return;
  }

  try {
    // Use text/plain to avoid CORS preflight with sendBeacon.
    // The log service accepts JSON regardless of Content-Type.
    const sent = navigator.sendBeacon(getEndpoint(), new Blob([payload], { type: 'text/plain' }));
    if (!sent) {
      fetch(getEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Never throw from the logging SDK
  }
}

function enqueue(entry: LogEntry): void {
  if (config && LEVEL_ORDER[entry.level] < LEVEL_ORDER[config.minLevel ?? 'warn']) return;
  buffer.push(entry);
  if (buffer.length >= MAX_BUFFER) {
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, FLUSH_INTERVAL);
  }
}

function makeEntry(level: string, message: string, extra?: {
  error_type?: string;
  stack_trace?: string;
  context?: Record<string, unknown>;
}): LogEntry {
  return {
    service: config?.service ?? 'unknown',
    source: 'frontend',
    level,
    message,
    error_type: extra?.error_type,
    stack_trace: extra?.stack_trace,
    context: extra?.context,
    user_agent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  };
}

export function initLogService(cfg: LogServiceConfig): void {
  config = cfg;

  window.addEventListener('error', (event) => {
    enqueue(makeEntry('error', event.message || 'Uncaught error', {
      error_type: event.error?.name ?? 'Error',
      stack_trace: event.error?.stack,
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        url: window.location.href,
      },
    }));
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    enqueue(makeEntry('error', `Unhandled rejection: ${message}`, {
      error_type: reason instanceof Error ? reason.name : 'UnhandledRejection',
      stack_trace: reason instanceof Error ? reason.stack : undefined,
      context: { url: window.location.href },
    }));
  });

  window.addEventListener('beforeunload', () => flush());
}

export const logService = {
  debug: (message: string, context?: Record<string, unknown>) =>
    enqueue(makeEntry('debug', message, { context })),
  info: (message: string, context?: Record<string, unknown>) =>
    enqueue(makeEntry('info', message, { context })),
  warn: (message: string, context?: Record<string, unknown>) =>
    enqueue(makeEntry('warn', message, { context })),
  error: (message: string, extra?: {
    error_type?: string;
    stack_trace?: string;
    context?: Record<string, unknown>;
  }) => enqueue(makeEntry('error', message, extra)),
  fatal: (message: string, extra?: {
    error_type?: string;
    stack_trace?: string;
    context?: Record<string, unknown>;
  }) => enqueue(makeEntry('fatal', message, extra)),
  flush,
};
