import { useEffect, useRef, useState, useCallback } from "react";
import { WS_BASE } from "../api/client.ts";

interface WsEvent {
  event: string;
  payload: Record<string, unknown>;
}

interface UseWebSocketResult {
  sendMessage: (msg: Record<string, unknown>) => void;
  lastEvent: WsEvent | null;
  connected: boolean;
}

export function useWebSocket(
  roomCode: string,
  token: string,
): UseWebSocketResult {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);

  useEffect(() => {
    const ws = new WebSocket(
      `${WS_BASE}/ws/${roomCode}?token=${token}`,
    );
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as WsEvent;
        setLastEvent(data);
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onclose = () => setConnected(false);

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [roomCode, token]);

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  return { sendMessage, lastEvent, connected };
}
