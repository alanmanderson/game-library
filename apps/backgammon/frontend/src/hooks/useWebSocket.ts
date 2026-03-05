import { useState, useEffect, useRef, useCallback } from "react";
import { WSMessage } from "../types/game";

// ---------------------------------------------------------------------------
// Public option / return interfaces
// ---------------------------------------------------------------------------

interface UseWebSocketOptions {
  /** Full WebSocket URL to connect to (e.g. "ws://localhost:8000/ws/game/abc"). */
  url: string;
  /** Fired whenever a parsed message arrives from the server. */
  onMessage?: (message: WSMessage) => void;
  /** Fired when the connection is established. */
  onOpen?: () => void;
  /** Fired when the connection is closed (before automatic reconnection). */
  onClose?: () => void;
  /** Fired when a WebSocket error event occurs. */
  onError?: (error: Event) => void;
  /** Milliseconds between reconnection attempts (default 3 000). */
  reconnectInterval?: number;
  /** Stop trying to reconnect after this many consecutive failures (default 10). */
  maxReconnectAttempts?: number;
}

interface UseWebSocketReturn {
  /** Send an arbitrary JSON-serialisable payload to the server. */
  sendMessage: (message: any) => void;
  /** Whether the WebSocket is currently in the OPEN state. */
  isConnected: boolean;
  /** The most recently received message (useful for one-off reads). */
  lastMessage: WSMessage | null;
  /** How many consecutive reconnection attempts have been made. */
  reconnectAttempts: number;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

/**
 * React hook that manages a WebSocket connection with automatic reconnection
 * and message buffering.
 *
 * Messages sent while disconnected are queued and flushed as soon as the
 * connection is re-established.
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectInterval = 3_000,
    maxReconnectAttempts = 10,
  } = options;

  // -- State exposed to consumers ------------------------------------------
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // -- Refs (stable across renders) ----------------------------------------
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageQueueRef = useRef<any[]>([]);
  /** Track whether the hook has been unmounted so we never reconnect after cleanup. */
  const unmountedRef = useRef(false);

  // Keep the latest callbacks in refs so the WebSocket event handlers always
  // call the most recent versions without needing to tear down / re-create
  // the connection on every render.
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // -- Connection logic ----------------------------------------------------

  const connect = useCallback(() => {
    // Guard: don't try to connect after unmount or if already open.
    if (unmountedRef.current) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setReconnectAttempts(0);
      onOpenRef.current?.();

      // Flush any messages that were queued while disconnected.
      const queue = messageQueueRef.current;
      messageQueueRef.current = [];
      for (const msg of queue) {
        ws.send(JSON.stringify(msg));
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const parsed: WSMessage = JSON.parse(event.data);
        setLastMessage(parsed);
        onMessageRef.current?.(parsed);
      } catch {
        // If the server sends non-JSON we silently ignore it.
        console.warn("[useWebSocket] Failed to parse message:", event.data);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      onCloseRef.current?.();

      // Attempt to reconnect unless we've exceeded the limit or unmounted.
      if (unmountedRef.current) return;
      setReconnectAttempts((prev) => {
        const next = prev + 1;
        if (next <= maxReconnectAttempts) {
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
        return next;
      });
    };

    ws.onerror = (event: Event) => {
      onErrorRef.current?.(event);
    };
  }, [url, reconnectInterval, maxReconnectAttempts]);

  // -- Lifecycle: connect on mount, clean up on unmount --------------------

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;

      // Clear any pending reconnection timer.
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      // Close the socket if it's still alive.
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // -- Public send helper --------------------------------------------------

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      // Buffer the message so it's delivered once the connection is back.
      messageQueueRef.current.push(message);
    }
  }, []);

  return { sendMessage, isConnected, lastMessage, reconnectAttempts };
}

export default useWebSocket;
