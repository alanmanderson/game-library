import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import type { WsEvent, UseWebSocketResult } from "@pinochle/shared";
import { RECONNECT_DELAYS, parseWsEvent } from "@pinochle/shared";
import { WS_BASE } from "../config";

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
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Event queue to prevent batching loss
  const queueRef = useRef<WsEvent[]>([]);
  const processingRef = useRef(false);
  const connectRef = useRef<(() => void) | null>(null);

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
          // ignore non-JSON messages
          return;
        }
        // PONG has no payload — skip schema validation.
        if (raw && typeof raw === "object" && (raw as { event?: string }).event === "PONG") {
          return;
        }
        const parsed = parseWsEvent(raw);
        if (!parsed) return; // malformed: already logged, drop
        queueRef.current.push(parsed);
        drainQueue();
      };

      ws.onerror = (event) => {
        console.warn("[useWebSocket] WebSocket error:", event);
      };

      ws.onclose = (event) => {
        if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
        setConnected(false);
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
            RECONNECT_DELAYS[
              Math.min(retriesRef.current, RECONNECT_DELAYS.length - 1)
            ];
          retriesRef.current += 1;
          timerRef.current = setTimeout(connect, delay);
        }
      };
    }

    connectRef.current = connect;
    connect();

    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [roomCode, token]);

  // Handle app foreground/background transitions.
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        const prev = appStateRef.current;
        appStateRef.current = nextAppState;

        if (nextAppState === "background" || nextAppState === "inactive") {
          // Going to background — close cleanly so the server knows we left.
          if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
          if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
          if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.close(1000);
            wsRef.current = null;
          }
          setConnected(false);
        } else if (nextAppState === "active" && prev !== "active") {
          // Returning to foreground — reconnect.
          retriesRef.current = 0;
          connectRef.current?.();
        }
      },
    );
    return () => subscription.remove();
  }, []);

  const sendMessage = useCallback((msg: Record<string, unknown>): boolean => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn("[useWebSocket] Message dropped — socket not connected:", msg);
      return false;
    }
    wsRef.current.send(JSON.stringify(msg));
    return true;
  }, []);

  return { sendMessage, lastEvent, connected };
}
