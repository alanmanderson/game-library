import { useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import type { ServerMessage } from '@forbidden-island/shared/types/protocol';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/game-ws`;
const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;

export function useWebSocket() {
  const setWs = useStore((s) => s.setWs);
  const setStatus = useStore((s) => s.setConnectionStatus);
  const handleMsg = useStore((s) => s.handleServerMessage);
  const reconnectDelay = useRef(RECONNECT_DELAY);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      setStatus('connecting');

      ws = new WebSocket(WS_URL);
      setWs(ws);

      ws.onopen = () => {
        if (unmounted) return;
        setStatus('connected');
        reconnectDelay.current = RECONNECT_DELAY;
      };

      ws.onmessage = (evt) => {
        if (unmounted) return;
        try {
          const msg: ServerMessage = JSON.parse(evt.data);
          handleMsg(msg);
        } catch (e) {
          console.error('Failed to parse WS message', e);
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setStatus('disconnected');
        setWs(null);
        // auto-reconnect with backoff
        reconnectTimer = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 1.5, MAX_RECONNECT_DELAY);
          connect();
        }, reconnectDelay.current);
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };
    }

    connect();

    return () => {
      unmounted = true;
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [setWs, setStatus, handleMsg]);
}
