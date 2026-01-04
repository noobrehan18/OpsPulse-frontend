import { useState, useEffect, useCallback, useRef } from 'react';

/* ================= CONFIG ================= */

const WS_ENABLED = import.meta.env.VITE_ENABLE_WS === 'true';

function getWebSocketURL() {
  if (!WS_ENABLED) return null;

  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  if (import.meta.env.DEV) {
    return 'ws://localhost:8001';
  }

  console.error('VITE_WS_URL is missing');
  return null;
}

const WS_BASE_URL = getWebSocketURL();

const INITIAL_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;
const MAX_RECONNECT_ATTEMPTS = 5;

/* ================= STATES ================= */

export const ConnectionState = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error',
};

export const Channels = {
  LOGS: 'logs',
  ALERTS: 'alerts',
  REMEDIATIONS: 'remediations',
  STATS: 'stats',
  HEALTH: 'health',
  PIPELINE: 'pipeline',
  ALL: 'all',
};

/* ================= SINGLETON ================= */

let globalWs = null;
let globalClientId = null;
let globalState = ConnectionState.DISCONNECTED;
let connectionListeners = new Set();
let messageListeners = new Set();
let reconnectTimeout = null;
let reconnectAttempts = 0;
let currentDelay = INITIAL_RECONNECT_DELAY;
let isConnecting = false;

/* ================= HELPERS ================= */

function notifyConnectionChange(state) {
  globalState = state;
  connectionListeners.forEach(fn => fn(state));
}

function notifyMessage(msg) {
  messageListeners.forEach(fn => fn(msg));
}

function connectGlobal() {
  if (!WS_ENABLED || !WS_BASE_URL) {
    notifyConnectionChange(ConnectionState.DISCONNECTED);
    return;
  }

  if (isConnecting || globalWs?.readyState === WebSocket.OPEN) return;

  isConnecting = true;
  notifyConnectionChange(ConnectionState.CONNECTING);

  try {
    globalWs = new WebSocket(`${WS_BASE_URL}/ws/live`);

    globalWs.onopen = () => {
      isConnecting = false;
      notifyConnectionChange(ConnectionState.CONNECTED);
      reconnectAttempts = 0;
      currentDelay = INITIAL_RECONNECT_DELAY;

      globalWs.send(
        JSON.stringify({ type: 'subscribe', channels: ['all'] })
      );
    };

    globalWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          globalClientId = data.client_id;
        }
        notifyMessage(data);
      } catch (e) {
        console.error('WS parse error', e);
      }
    };

    globalWs.onerror = () => {
      isConnecting = false;
      notifyConnectionChange(ConnectionState.ERROR);
    };

    globalWs.onclose = () => {
      isConnecting = false;
      globalWs = null;
      globalClientId = null;
      notifyConnectionChange(ConnectionState.DISCONNECTED);

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = Math.min(currentDelay, MAX_RECONNECT_DELAY);
        currentDelay *= 2;
        reconnectTimeout = setTimeout(connectGlobal, delay);
      }
    };
  } catch (e) {
    isConnecting = false;
    notifyConnectionChange(ConnectionState.ERROR);
  }
}

/* ================= HOOK ================= */

export function useWebSocket({
  autoConnect = true,
  onLog,
  onAlert,
  onRemediation,
  onStats,
  onHealth,
  onMessage,
} = {}) {
  const [connectionState, setConnectionState] = useState(globalState);
  const [clientId, setClientId] = useState(globalClientId);
  const [lastMessage, setLastMessage] = useState(null);
  const [error, setError] = useState(null);

  const callbacksRef = useRef({
    onLog, onAlert, onRemediation, onStats, onHealth, onMessage
  });

  callbacksRef.current = {
    onLog, onAlert, onRemediation, onStats, onHealth, onMessage
  };

  useEffect(() => {
    const onConnectionChange = (state) => {
      setConnectionState(state);
      if (state === ConnectionState.ERROR) {
        setError('WebSocket error');
      }
    };

    const onMsg = (data) => {
      setLastMessage(data);
      const cb = callbacksRef.current;
      cb.onMessage?.(data);

      switch (data.type) {
        case 'log': cb.onLog?.(data.data); break;
        case 'alert': cb.onAlert?.(data.data); break;
        case 'remediation': cb.onRemediation?.(data.data); break;
        case 'stats': cb.onStats?.(data.data); break;
        case 'health': cb.onHealth?.(data.data); break;
      }
    };

    connectionListeners.add(onConnectionChange);
    messageListeners.add(onMsg);

    if (autoConnect) connectGlobal();

    return () => {
      connectionListeners.delete(onConnectionChange);
      messageListeners.delete(onMsg);
    };
  }, [autoConnect]);

  return {
    connectionState,
    isConnected: connectionState === ConnectionState.CONNECTED,
    clientId,
    lastMessage,
    error,
  };
}

export default useWebSocket;
