import { useEffect, useRef, useState, useCallback } from "react";
import { WS_BASE } from "../config";

interface WsEvent {
  event: string;
  payload: Record<string, unknown>;
}

interface UseWebSocketResult {
  sendMessage: (msg: Record<string, unknown>) => void;
  lastEvent: WsEvent | null;
  connected: boolean;
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 10000];

function buildWsUrl(roomCode: string, token: string): string {
  return `${WS_BASE}/ws/${roomCode}?token=${token}`;
}

/**
 * Queue-based WebSocket hook for React Native.
 *
 * React 18 batches rapid state updates, so if the server sends multiple
 * events in quick succession (e.g. HAND_DEALT + BIDDING_TURN on game start),
 * only the last one would trigger a render with plain setState.
 *
 * This hook queues incoming events and processes them one at a time,
 * waiting for each to be consumed (via useEffect) before delivering the next.
 */
export function useWebSocket(
  roomCode: string,
  token: string,
): UseWebSocketResult {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);
  const retriesRef = useRef(0);
  const unmountedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Event queue to prevent batching loss
  const queueRef = useRef<WsEvent[]>([]);
  const processingRef = useRef(false);

  function drainQueue() {
    if (processingRef.current || queueRef.current.length === 0) return;
    processingRef.current = true;
    const next = queueRef.current.shift()!;
    setLastEvent(next);
  }

  // After each event is consumed by the subscriber's useEffect,
  // mark processing as done and deliver the next queued event.
  useEffect(() => {
    if (lastEvent === null) return;
    // Use setTimeout(0) to let the subscriber's useEffect run first
    // (subscriber also depends on lastEvent, but runs in declaration order)
    const t = setTimeout(() => {
      processingRef.current = false;
      drainQueue();
    }, 0);
    return () => clearTimeout(t);
  }, [lastEvent]);

  useEffect(() => {
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) return;

      const ws = new WebSocket(buildWsUrl(roomCode, token));
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retriesRef.current = 0;
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as WsEvent;
          queueRef.current.push(data);
          drainQueue();
        } catch {
          // ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!unmountedRef.current) {
          const delay =
            RECONNECT_DELAYS[
              Math.min(retriesRef.current, RECONNECT_DELAYS.length - 1)
            ];
          retriesRef.current += 1;
          timerRef.current = setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [roomCode, token]);

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  return { sendMessage, lastEvent, connected };
}
