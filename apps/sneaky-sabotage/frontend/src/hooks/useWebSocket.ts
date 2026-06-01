import { useState, useEffect, useRef, useCallback } from "react";
import type { WSMessage, ClientMessage } from "../types/game";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

interface UseWebSocketOptions {
  /** Full WebSocket URL (e.g. "ws://localhost:8000/ws/ABCD/pid?token=xyz"). */
  url: string | null;
  /** Called on every parsed server message. */
  onMessage?: (message: WSMessage) => void;
  /** Called when the connection opens. */
  onOpen?: () => void;
  /** Called when the connection closes (before reconnect attempt). */
  onClose?: () => void;
  /** Initial reconnect delay in ms (default 1000). Doubles on each failure. */
  reconnectInterval?: number;
  /** Stop reconnecting after this many consecutive failures (default 8). */
  maxReconnectAttempts?: number;
}

interface UseWebSocketReturn {
  sendMessage: (message: ClientMessage) => void;
  isConnected: boolean;
  lastMessage: WSMessage | null;
  reconnectAttempts: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    onMessage,
    onOpen,
    onClose,
    reconnectInterval = 1_000,
    maxReconnectAttempts = 8,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageQueueRef = useRef<ClientMessage[]>([]);
  const unmountedRef = useRef(false);
  const attemptsRef = useRef(0);

  // Keep latest callbacks in refs so we never tear down the socket on re-render.
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const connect = useCallback(() => {
    if (unmountedRef.current || !url) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      attemptsRef.current = 0;
      setReconnectAttempts(0);
      onOpenRef.current?.();

      // Flush queued messages
      const queue = messageQueueRef.current;
      messageQueueRef.current = [];
      for (const msg of queue) {
        ws.send(JSON.stringify(msg));
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const raw = JSON.parse(event.data) as { type: string; [key: string]: unknown };

        // Respond to heartbeat pings
        if (raw.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        const parsed = raw as unknown as WSMessage;
        setLastMessage(parsed);
        onMessageRef.current?.(parsed);
      } catch {
        console.warn("[useWebSocket] Failed to parse message:", event.data);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      onCloseRef.current?.();

      if (unmountedRef.current) return;

      // Exponential backoff reconnect
      const next = attemptsRef.current + 1;
      attemptsRef.current = next;
      setReconnectAttempts(next);

      if (next <= maxReconnectAttempts) {
        const delay = reconnectInterval * Math.pow(2, next - 1);
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = () => {
      // The close handler will fire after this and manage reconnection.
    };
  }, [url, reconnectInterval, maxReconnectAttempts]);

  // Connect on mount / url change, clean up on unmount.
  useEffect(() => {
    unmountedRef.current = false;
    attemptsRef.current = 0;
    setReconnectAttempts(0);
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendMessage = useCallback((message: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      messageQueueRef.current.push(message);
    }
  }, []);

  return { sendMessage, isConnected, lastMessage, reconnectAttempts };
}

export default useWebSocket;
