import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketClient, ConnectionStatus } from '../lib/WebSocketClient';

/**
 * Owns one WebSocketClient instance for the lifetime of the component
 * that calls it (usually mounted once, near the app root, and the
 * `client` it returns is passed down or put in context/state).
 */
export function useWebSocket(url) {
  const clientRef = useRef(null);
  const [status, setStatus] = useState(ConnectionStatus.IDLE);

  if (!clientRef.current) {
    clientRef.current = new WebSocketClient(url);
  }

  useEffect(() => {
    const client = clientRef.current;
    const unsubscribe = client.onStatusChange(setStatus);
    client.connect();
    return () => {
      unsubscribe();
      client.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const send = useCallback((type, payload) => {
    clientRef.current.send(type, payload);
  }, []);

  const subscribe = useCallback((channel) => {
    clientRef.current.send('subscribe', { channel });
  }, []);

  const unsubscribe = useCallback((channel) => {
    clientRef.current.send('unsubscribe', { channel });
  }, []);

  return { client: clientRef.current, status, send, subscribe, unsubscribe };
}

/**
 * Subscribes a component to one channel's events for as long as it's
 * mounted. Pass a stable `onMessage` (wrap in useCallback) to avoid
 * resubscribing every render.
 */
export function useChannel(client, channel, onMessage) {
  useEffect(() => {
    if (!client) return;
    const off = client.on(`channel:${channel}`, onMessage);
    client.send('subscribe', { channel });
    return () => {
      off();
      client.send('unsubscribe', { channel });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, channel]);
}
