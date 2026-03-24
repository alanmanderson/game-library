import { useEffect, useRef, useState, useCallback } from "react";
import { flushSync } from "react-dom";
import type { WsEvent, UseWebSocketResult } from "@pinochle/shared";
import { RECONNECT_DELAYS } from "@pinochle/shared";
import { WS_BASE } from "../api/client.ts";

function buildWsUrl(roomCode: string, token: string): string {
  const path = `/ws/${roomCode}?token=${token}`;
  if (WS_BASE) return `${WS_BASE}${path}`;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}

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
        try {
          const data = JSON.parse(e.data) as WsEvent;
          // flushSync prevents React from batching rapid back-to-back events
          // (e.g. HAND_DEALT + BIDDING_TURN) which would cause the first to be lost
          flushSync(() => setLastEvent(data));
        } catch {
          // ignore non-JSON messages
        }
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

  return { sendMessage, lastEvent, connected };
}
