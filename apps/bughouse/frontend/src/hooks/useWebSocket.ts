import { useEffect, useRef, useState, useCallback } from 'react';
import { ServerMessage, ClientMessage } from '../types';

// Use the current origin for API calls. In dev, CRA's proxy (package.json)
// forwards /api/* and /ws/* to the backend, so relative URLs work with any
// host port mapping. In production, backend serves frontend on the same origin.
const API_BASE = process.env.REACT_APP_API_URL || window.location.origin;

function wsBase(): string {
  const base = API_BASE.replace(/\/$/, '');
  return base.replace(/^http/, 'ws');
}

const MAX_RECONNECT_ATTEMPTS = 10;

/** Close codes that indicate we should NOT attempt to reconnect. */
const NO_RECONNECT_CODES = new Set([
  1000, // normal close
  4001, // invalid token
  4004, // game not found
  4008, // replaced by new connection
]);

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketOptions {
  gameId: string;
  token: string;
  onMessage: (msg: ServerMessage) => void;
  enabled?: boolean;
}

export function useWebSocket({ gameId, token, onMessage, enabled = true }: UseWebSocketOptions) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !gameId || !token) return;

    cleanup();
    setStatus('connecting');

    const url = `${wsBase()}/ws/${gameId}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttempt.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        onMessageRef.current(msg);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onerror = () => {
      setStatus('error');
    };

    ws.onclose = (event: CloseEvent) => {
      wsRef.current = null;

      // Don't reconnect on intentional / terminal server closes
      if (NO_RECONNECT_CODES.has(event.code)) {
        setStatus('disconnected');
        return;
      }

      // Stop reconnecting after too many attempts
      if (reconnectAttempt.current >= MAX_RECONNECT_ATTEMPTS) {
        setStatus('error');
        return;
      }

      setStatus('disconnected');

      // Auto-reconnect with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempt.current), 15000);
      reconnectAttempt.current += 1;
      reconnectTimer.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, [enabled, gameId, token, cleanup]);

  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  const sendMessage = useCallback((msg: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn('sendMessage called while WebSocket is not open. Message was not sent:', msg);
    }
  }, []);

  return { status, sendMessage };
}

// API helper using the same base URL
export const API_URL = (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/$/, '');
