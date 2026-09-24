export const MESSAGE_TYPES = Object.freeze({
  READY: "ready",
  DATA: "data",
  READY_CHECK: "readycheck",
  HEIGHT: "height"
});

const ALLOWED_TYPES = new Set(Object.values(MESSAGE_TYPES));

export function isValidOrigin(value) {
  if (typeof value !== "string" || value === "*") return false;
  try {
    const url = new URL(value);
    return (
      /^https?:$/.test(url.protocol) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function createMessenger({ targetWindow, targetOrigin, hostWindow = window, onEvent = () => {} }) {
  if (!targetWindow || typeof targetWindow.postMessage !== "function") {
    throw new TypeError("targetWindow must support postMessage");
  }
  if (!isValidOrigin(targetOrigin)) {
    throw new TypeError("A valid HTTP(S) target origin is required");
  }
  if (!hostWindow || typeof hostWindow.addEventListener !== "function") {
    throw new TypeError("hostWindow must support event listeners");
  }

  const normalizedOrigin = new URL(targetOrigin).origin;
  const listeners = new Map();
  let listening = false;
  let ready = false;

  function emit(type, data) {
    for (const listener of listeners.get(type) || []) listener(data);
  }

  function send(type, data) {
    if (!ALLOWED_TYPES.has(type)) throw new TypeError(`Unknown message type: ${type}`);
    const message = data === undefined ? { type } : { type, data };
    targetWindow.postMessage(message, normalizedOrigin);
    onEvent({ direction: "sent", type, data });
  }

  function handleMessage(event) {
    if (event.origin !== normalizedOrigin || event.source !== targetWindow) return;
    if (!event.data || typeof event.data !== "object" || !ALLOWED_TYPES.has(event.data.type)) return;

    const { type, data } = event.data;
    onEvent({ direction: "received", type, data });
    if (type === MESSAGE_TYPES.READY_CHECK) send(MESSAGE_TYPES.READY);
    if (type === MESSAGE_TYPES.READY) ready = true;
    emit(type, data);
  }

  return {
    start() {
      if (listening) return;
      hostWindow.addEventListener("message", handleMessage);
      listening = true;
      send(MESSAGE_TYPES.READY);
    },
    stop() {
      if (!listening) return;
      hostWindow.removeEventListener("message", handleMessage);
      listening = false;
      ready = false;
    },
    on(type, listener) {
      if (!ALLOWED_TYPES.has(type)) throw new TypeError(`Unknown message type: ${type}`);
      if (typeof listener !== "function") throw new TypeError("listener must be a function");
      const typedListeners = listeners.get(type) || new Set();
      typedListeners.add(listener);
      listeners.set(type, typedListeners);
      return () => typedListeners.delete(listener);
    },
    send,
    isReady() {
      return ready;
    }
  };
}
