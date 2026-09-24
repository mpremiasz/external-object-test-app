import assert from "node:assert/strict";
import { test } from "node:test";

import { MESSAGE_TYPES, createMessenger, isValidOrigin } from "../public/messenger.js";

class FakeWindow {
  constructor() {
    this.listeners = new Map();
    this.messages = [];
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message, origin) {
    this.messages.push({ message, origin });
  }

  dispatchMessage(event) {
    for (const listener of this.listeners.get("message") || []) listener(event);
  }
}

test("isValidOrigin accepts HTTP origins and rejects paths or unsafe schemes", () => {
  assert.equal(isValidOrigin("https://parent.example.test"), true);
  assert.equal(isValidOrigin("http://localhost:8080"), true);
  assert.equal(isValidOrigin("https://parent.example.test/"), true);
  assert.equal(isValidOrigin("https://parent.example.test/path"), false);
  assert.equal(isValidOrigin("javascript:alert(1)"), false);
  assert.equal(isValidOrigin("*"), false);
  assert.equal(isValidOrigin("not a url"), false);
});

test("messenger validates required construction options", () => {
  const hostWindow = new FakeWindow();
  const targetWindow = new FakeWindow();
  assert.throws(() => createMessenger({ hostWindow, targetWindow, targetOrigin: "*" }), /origin/i);
  assert.throws(() => createMessenger({ hostWindow, targetOrigin: "https://example.test" }), /targetWindow/i);
});

test("start performs ready handshake and readycheck receives a ready response", () => {
  const hostWindow = new FakeWindow();
  const targetWindow = new FakeWindow();
  const events = [];
  const messenger = createMessenger({
    hostWindow,
    targetWindow,
    targetOrigin: "https://parent.example.test",
    onEvent: event => events.push(event)
  });

  messenger.start();
  messenger.start();
  assert.deepEqual(targetWindow.messages, [
    { message: { type: MESSAGE_TYPES.READY }, origin: "https://parent.example.test" }
  ]);
  assert.equal(hostWindow.listeners.get("message").size, 1);

  hostWindow.dispatchMessage({
    origin: "https://parent.example.test",
    source: targetWindow,
    data: { type: MESSAGE_TYPES.READY_CHECK }
  });
  assert.equal(targetWindow.messages.at(-1).message.type, MESSAGE_TYPES.READY);
  assert.equal(events.at(-2).direction, "received");
  assert.equal(events.at(-1).direction, "sent");
});

test("messenger dispatches typed data and marks peer ready", () => {
  const hostWindow = new FakeWindow();
  const targetWindow = new FakeWindow();
  const messenger = createMessenger({ hostWindow, targetWindow, targetOrigin: "https://parent.example.test" });
  const data = [];
  const ready = [];
  messenger.on(MESSAGE_TYPES.DATA, value => data.push(value));
  messenger.on(MESSAGE_TYPES.READY, value => ready.push(value));
  messenger.start();

  hostWindow.dispatchMessage({
    origin: "https://parent.example.test",
    source: targetWindow,
    data: { type: MESSAGE_TYPES.DATA, data: '{"recordId":42}' }
  });
  hostWindow.dispatchMessage({
    origin: "https://parent.example.test",
    source: targetWindow,
    data: { type: MESSAGE_TYPES.READY }
  });

  assert.deepEqual(data, ['{"recordId":42}']);
  assert.equal(ready.length, 1);
  assert.equal(messenger.isReady(), true);
});

test("messenger ignores wrong origins, wrong sources, and malformed data", () => {
  const hostWindow = new FakeWindow();
  const targetWindow = new FakeWindow();
  const received = [];
  const messenger = createMessenger({ hostWindow, targetWindow, targetOrigin: "https://parent.example.test" });
  messenger.on(MESSAGE_TYPES.DATA, value => received.push(value));
  messenger.start();

  const validData = { type: MESSAGE_TYPES.DATA, data: "secret" };
  hostWindow.dispatchMessage({ origin: "https://evil.example", source: targetWindow, data: validData });
  hostWindow.dispatchMessage({ origin: "https://parent.example.test", source: new FakeWindow(), data: validData });
  hostWindow.dispatchMessage({ origin: "https://parent.example.test", source: targetWindow, data: null });
  hostWindow.dispatchMessage({ origin: "https://parent.example.test", source: targetWindow, data: { data: "missing type" } });

  assert.deepEqual(received, []);
});

test("send uses exact message shape and stop is idempotent", () => {
  const hostWindow = new FakeWindow();
  const targetWindow = new FakeWindow();
  const messenger = createMessenger({ hostWindow, targetWindow, targetOrigin: "https://parent.example.test" });
  messenger.start();
  messenger.send(MESSAGE_TYPES.HEIGHT, 432);
  messenger.stop();
  messenger.stop();

  assert.deepEqual(targetWindow.messages.at(-1), {
    message: { type: MESSAGE_TYPES.HEIGHT, data: 432 },
    origin: "https://parent.example.test"
  });
  assert.equal(hostWindow.listeners.get("message").size, 0);
  assert.equal(messenger.isReady(), false);
  assert.throws(() => messenger.send("unknown", 1), /message type/i);
});
