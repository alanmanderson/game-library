import { useEffect, useRef, useState, useCallback } from 'react';
import { ServerMessage, ClientMessage } from '../types';

const API_BASE = process.env.REACT_APP_API_URL || (
  window.location.port === '3000'
    ? 'http://localhost:8000'
    : window.location.origin
);

function wsBase(): string {
  const base = API_BASE.replace(/\/$/, '');
  return base.replace(/^http/, 'ws');
}

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

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;

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
    }
  }, []);

  return { status, sendMessage };
}

// API helper using the same base URL
export const API_URL = (process.env.REACT_APP_API_URL || (
  window.location.port === '3000'
    ? 'http://localhost:8000'
    : window.location.origin
)).replace(/\/$/, '');
