export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogSource = 'frontend' | 'backend';
export type ErrorStatus = 'open' | 'resolved' | 'ignored';

export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

export interface LogEntry {
  service: string;
  source: LogSource;
  level: LogLevel;
  message: string;
  error_type?: string;
  stack_trace?: string;
  context?: Record<string, unknown>;
  user_agent?: string;
  timestamp?: string;
}

export interface IngestRequest {
  entries: LogEntry[];
}

export interface StoredLogEntry extends LogEntry {
  id: number;
  fingerprint: string | null;
  created_at: string;
}

export interface ErrorGroup {
  id: number;
  fingerprint: string;
  service: string;
  source: LogSource;
  error_type: string;
  message: string;
  stack_trace: string | null;
  status: ErrorStatus;
  first_seen: string;
  last_seen: string;
  count: number;
  github_issue_url: string | null;
  created_at: string;
  updated_at: string;
}
