import assert from "node:assert/strict";
import { test } from "node:test";

import { measureDocumentHeight, observeHeight, parseManualHeight } from "../public/height.js";

test("measureDocumentHeight returns the body content box independently of the iframe viewport", () => {
  const documentLike = {
    body: {
      scrollHeight: 900,
      offsetHeight: 875,
      getBoundingClientRect: () => ({ height: 420.25 })
    },
    documentElement: { clientHeight: 900, scrollHeight: 900, offsetHeight: 900 }
  };
  assert.equal(measureDocumentHeight(documentLike), 421);
});

test("measureDocumentHeight falls back to body dimensions when layout bounds are unavailable", () => {
  const documentLike = {
    body: { scrollHeight: 100, offsetHeight: 250 },
    documentElement: { clientHeight: 900, scrollHeight: 900, offsetHeight: 900 }
  };
  assert.equal(measureDocumentHeight(documentLike), 250);
  assert.equal(measureDocumentHeight({ body: null, documentElement: null }), 0);
});

test("parseManualHeight converts integers and preserves malformed negative-test values", () => {
  assert.equal(parseManualHeight("432"), 432);
  assert.equal(parseManualHeight(" 10001 "), 10001);
  assert.equal(parseManualHeight("0"), 0);
  assert.equal(parseManualHeight("-5"), -5);
  assert.equal(parseManualHeight("banana"), "banana");
  assert.equal(parseManualHeight(""), "");
});

test("observeHeight emits initial and changed heights without duplicates", () => {
  let height = 100;
  let resizeCallback;
  const disconnected = [];
  class FakeResizeObserver {
    constructor(callback) {
      resizeCallback = callback;
    }
    observe(target) {
      assert.equal(target, documentLike.body);
    }
    disconnect() {
      disconnected.push(true);
    }
  }
  const documentLike = {
    body: { get scrollHeight() { return height; }, offsetHeight: 0 },
    documentElement: { clientHeight: 0, get scrollHeight() { return height; }, offsetHeight: 0 }
  };
  const values = [];
  const cleanup = observeHeight({
    documentLike,
    onHeight: value => values.push(value),
    ResizeObserverClass: FakeResizeObserver,
    schedule: callback => callback()
  });

  resizeCallback();
  height = 250;
  resizeCallback();
  resizeCallback();

  assert.deepEqual(values, [100, 250]);
  cleanup();
  cleanup();
  assert.equal(disconnected.length, 1);
});

test("observeHeight defaults to observing the body for whole-page layout changes", () => {
  let observedTarget;
  class FakeResizeObserver {
    constructor() {}
    observe(value) { observedTarget = value; }
    disconnect() {}
  }
  const documentLike = {
    body: { scrollHeight: 100, offsetHeight: 100 },
    documentElement: { clientHeight: 0, scrollHeight: 100, offsetHeight: 100 }
  };
  const cleanup = observeHeight({
    documentLike,
    onHeight: () => {},
    ResizeObserverClass: FakeResizeObserver
  });
  assert.equal(observedTarget, documentLike.body);
  cleanup();
});

test("observeHeight falls back to mutation and window resize listeners", () => {
  let mutationCallback;
  const documentLike = {
    body: { scrollHeight: 100, offsetHeight: 0 },
    documentElement: { clientHeight: 0, scrollHeight: 100, offsetHeight: 0 }
  };
  const hostWindow = {
    listener: null,
    addEventListener(type, listener) {
      assert.equal(type, "resize");
      this.listener = listener;
    },
    removeEventListener(type, listener) {
      assert.equal(type, "resize");
      assert.equal(listener, this.listener);
      this.listener = null;
    }
  };
  let mutationDisconnected = false;
  class FakeMutationObserver {
    constructor(callback) {
      mutationCallback = callback;
    }
    observe(target, options) {
      assert.equal(target, documentLike.body);
      assert.deepEqual(options, { childList: true, subtree: true, attributes: true });
    }
    disconnect() {
      mutationDisconnected = true;
    }
  }
  const values = [];
  const cleanup = observeHeight({
    documentLike,
    hostWindow,
    onHeight: value => values.push(value),
    ResizeObserverClass: null,
    MutationObserverClass: FakeMutationObserver,
    schedule: callback => callback()
  });

  documentLike.body.scrollHeight = 175;
  mutationCallback();
  hostWindow.listener();
  assert.deepEqual(values, [100, 175]);

  cleanup();
  assert.equal(mutationDisconnected, true);
  assert.equal(hostWindow.listener, null);
});

test("observeHeight can isolate observation to a caller-provided resize target", () => {
  const target = { id: "generated-content" };
  let observedTarget;
  class FakeResizeObserver {
    constructor() {}
    observe(value) { observedTarget = value; }
    disconnect() {}
  }
  const documentLike = {
    body: { scrollHeight: 100, offsetHeight: 0 },
    documentElement: { clientHeight: 0, scrollHeight: 100, offsetHeight: 0 }
  };

  const cleanup = observeHeight({
    documentLike,
    observeTarget: target,
    onHeight: () => {},
    ResizeObserverClass: FakeResizeObserver
  });

  assert.equal(observedTarget, target);
  cleanup();
});

test("observeHeight debounces pending measurements and cancels scheduled work", () => {
  const scheduled = [];
  const cancelled = [];
  class FakeResizeObserver {
    constructor(callback) { this.callback = callback; FakeResizeObserver.instance = this; }
    observe() {}
    disconnect() {}
  }
  const documentLike = {
    body: { scrollHeight: 100, offsetHeight: 0 },
    documentElement: { clientHeight: 0, scrollHeight: 100, offsetHeight: 0 }
  };
  const cleanup = observeHeight({
    documentLike,
    onHeight: () => {},
    ResizeObserverClass: FakeResizeObserver,
    schedule: callback => { scheduled.push(callback); return scheduled.length; },
    cancel: handle => cancelled.push(handle)
  });

  FakeResizeObserver.instance.callback();
  FakeResizeObserver.instance.callback();
  assert.equal(scheduled.length, 1);
  cleanup();
  assert.deepEqual(cancelled, [1]);
});
