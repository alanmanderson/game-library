import { useEffect, useRef, useState, useCallback } from "react";
import type { WsEvent } from "@pinochle/shared";
import { RECONNECT_DELAYS, parseWsEvent } from "@pinochle/shared";
import { WS_BASE } from "../api/client.ts";

function buildWsUrl(roomCode: string, token: string): string {
  const path = `/ws/${roomCode}?token=${token}`;
  if (WS_BASE) return `${WS_BASE}${path}`;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}

export interface UseWebSocketOptions {
  /** Called synchronously for every parsed WsEvent, directly from ws.onmessage. */
  onEvent: (event: WsEvent) => void;
  /** Optional: notified when the connection-status boolean flips. */
  onStatusChange?: (connected: boolean) => void;
}

export interface UseWebSocketApi {
  sendMessage: (msg: Record<string, unknown>) => boolean;
  connected: boolean;
}

/**
 * Pub/sub WebSocket hook.
 *
 * Events are dispatched imperatively to `onEvent` from `ws.onmessage` — no
 * React state per event. The only state this hook owns is the coarse
 * `connected` flag for UI indicators.
 *
 * The consumer's `onEvent` callback is read via a ref on every message, so
 * passing a new function every render is fine (no need for useCallback).
 */
export function useWebSocket(
  roomCode: string,
  token: string,
  { onEvent, onStatusChange }: UseWebSocketOptions,
): UseWebSocketApi {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const retriesRef = useRef(0);
  const unmountedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Latest callbacks, read at message-dispatch time. Lets callers pass fresh
  // closures without forcing the socket to reconnect.
  const onEventRef = useRef(onEvent);
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onEventRef.current = onEvent;
    onStatusChangeRef.current = onStatusChange;
  });

  useEffect(() => {
    unmountedRef.current = false;

    function setStatus(next: boolean) {
      setConnected(next);
      onStatusChangeRef.current?.(next);
    }

    function connect() {
      if (unmountedRef.current) return;

      const ws = new WebSocket(buildWsUrl(roomCode, token));
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus(true);
        retriesRef.current = 0;
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: "PING" }));
          }
        }, 30000);
      };

      ws.onmessage = (e) => {
        let raw: unknown;
        try {
          raw = JSON.parse(e.data);
        } catch {
          // ignore non-JSON messages (including server PONGs without JSON body)
          return;
        }
        // PONG has no payload field — let it through without schema validation.
        if (raw && typeof raw === "object" && (raw as { event?: string }).event === "PONG") {
          return;
        }
        const parsed = parseWsEvent(raw);
        if (!parsed) return; // malformed message: already logged, drop it
        onEventRef.current(parsed);
      };

      ws.onclose = (event) => {
        if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
        setStatus(false);
        wsRef.current = null;
        if (event.code === 4001) {
          console.warn("[useWebSocket] Authentication failed — not reconnecting");
          return;
        }
        if (event.code === 4004) {
          console.warn("[useWebSocket] Room not found — not reconnecting");
          return;
        }
        if (event.code === 1000) {
          return;
        }
        if (!unmountedRef.current) {
          const delay =
            RECONNECT_DELAYS[Math.min(retriesRef.current, RECONNECT_DELAYS.length - 1)];
          retriesRef.current += 1;
          timerRef.current = setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [roomCode, token]);

  const sendMessage = useCallback((msg: Record<string, unknown>): boolean => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn("[useWebSocket] Message dropped — socket not connected:", msg);
      return false;
    }
    wsRef.current.send(JSON.stringify(msg));
    return true;
  }, []);

  return { sendMessage, connected };
}
