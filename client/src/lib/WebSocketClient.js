/**
 * Framework-agnostic WebSocket client.
 *
 * Kept independent of React on purpose: React only ever sees a thin hook
 * wrapper (see hooks/useWebSocket.js). That means:
 *  - the connection survives component re-renders
 *  - you can unit-test this class with zero React involved
 *  - the exact same class works in the real wallet app
 *
 * Responsibilities:
 *  - open/close the socket
 *  - reconnect with exponential backoff when the connection drops
 *  - queue outgoing messages sent while disconnected, flush on reconnect
 *  - pub/sub: components subscribe to message types or channels by name
 */

export const ConnectionStatus = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  OPEN: 'open',
  RECONNECTING: 'reconnecting',
  CLOSED: 'closed',
};

export class WebSocketClient {
  constructor(url, { baseReconnectDelay = 500, maxReconnectDelay = 15000 } = {}) {
    this.url = url;
    this.ws = null;
    this.status = ConnectionStatus.IDLE;

    this.listeners = new Map(); // eventKey -> Set<fn>
    this.statusListeners = new Set();

    this.reconnectAttempts = 0;
    this.baseReconnectDelay = baseReconnectDelay;
    this.maxReconnectDelay = maxReconnectDelay;
    this.reconnectTimer = null;
    this.shouldReconnect = true;

    this.outgoingQueue = [];
  }

  connect() {
    this.shouldReconnect = true;
    this._open();
  }

  disconnect() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  send(type, payload = {}) {
    const raw = JSON.stringify({ type, ...payload });
    if (this.status === ConnectionStatus.OPEN) {
      this.ws.send(raw);
    } else {
      // queued messages get sent the moment the connection reopens
      this.outgoingQueue.push(raw);
    }
  }

  /** Subscribe to a message `type` (e.g. "connected", "error") or a
   *  channel via "channel:<name>" (e.g. "channel:deposit"). Returns
   *  an unsubscribe function — call it in a useEffect cleanup. */
  on(eventKey, fn) {
    if (!this.listeners.has(eventKey)) this.listeners.set(eventKey, new Set());
    this.listeners.get(eventKey).add(fn);
    return () => this.listeners.get(eventKey)?.delete(fn);
  }

  onStatusChange(fn) {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  _open() {
    this._setStatus(this.reconnectAttempts > 0 ? ConnectionStatus.RECONNECTING : ConnectionStatus.CONNECTING);
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this._setStatus(ConnectionStatus.OPEN);
      this._flushQueue();
    };

    this.ws.onmessage = (evt) => {
      let data;
      try {
        data = JSON.parse(evt.data);
      } catch {
        return;
      }
      this._emit(data.type, data);
      if (data.type === 'event') {
        const channel = data.channel || data.payload?.channel;
        let payload = data.payload || data;
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          const numericKeys = Object.keys(payload).filter((key) => /^\d+$/.test(key));
          if (numericKeys.length > 0) {
            payload = numericKeys
              .sort((a, b) => Number(a) - Number(b))
              .map((key) => payload[key]);
          }
        }
        if (channel) {
          this._emit(`channel:${channel}`, payload);
        }
      }
    };

    this.ws.onclose = () => {
      this._setStatus(ConnectionStatus.CLOSED);
      if (this.shouldReconnect) this._scheduleReconnect();
    };


  }

  _scheduleReconnect() {
    const delay = Math.min(this.baseReconnectDelay * 2 ** this.reconnectAttempts, this.maxReconnectDelay);
    this.reconnectAttempts += 1;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this._open(), delay);
  }

  _flushQueue() {
    while (this.outgoingQueue.length) {
      this.ws.send(this.outgoingQueue.shift());
    }
  }

  _emit(eventKey, data) {
    this.listeners.get(eventKey)?.forEach((fn) => fn(data));
  }

  _setStatus(status) {
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status));
  }
}
