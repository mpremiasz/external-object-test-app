import { measureDocumentHeight, observeHeight, parseManualHeight } from "./height.js";
import { createMessenger, isValidOrigin, MESSAGE_TYPES } from "./messenger.js";

export function resolveParentOrigin(config = {}, locationLike = { search: "" }) {
  const query = new URLSearchParams(locationLike.search || "");
  if (query.has("parentOrigin")) {
    const queryOrigin = query.get("parentOrigin") || "";
    return isValidOrigin(queryOrigin)
      ? { origin: new URL(queryOrigin).origin, source: "query" }
      : { origin: "", source: "invalid-query" };
  }
  if (isValidOrigin(config.parentOrigin)) {
    return { origin: new URL(config.parentOrigin).origin, source: "server" };
  }
  return { origin: "", source: "missing" };
}

export function formatPayload(value) {
  if (value === undefined) return "No data received.";
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(parsed, null, 2);
  } catch {
    return "[Unserializable payload]";
  }
}

export function createEventLog(limit = 100) {
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError("limit must be a positive integer");
  const values = [];
  return {
    add(entry) {
      values.push(entry);
      if (values.length > limit) values.splice(0, values.length - limit);
    },
    entries() {
      return values.slice();
    },
    clear() {
      values.length = 0;
    }
  };
}

function initialize() {
  const elements = {
    status: document.querySelector("#connection-status"),
    origin: document.querySelector("#parent-origin"),
    measured: document.querySelector("#measured-height"),
    sent: document.querySelector("#sent-height"),
    payload: document.querySelector("#received-data"),
    log: document.querySelector("#event-log"),
    content: document.querySelector("#generated-content"),
    auto: document.querySelector("#auto-height"),
    manual: document.querySelector("#manual-height"),
    announcement: document.querySelector("#announcement")
  };
  const resolution = resolveParentOrigin(window.__EXTERNAL_OBJECT_TEST_CONFIG__ || {}, window.location);
  const eventLog = createEventLog();
  let blockNumber = 0;
  let lastMeasuredHeight = measureDocumentHeight(document);
  let messenger = null;

  elements.origin.textContent = resolution.origin || "Not configured";

  function renderLog() {
    elements.log.replaceChildren(
      ...eventLog.entries().map(entry => {
        const item = document.createElement("li");
        item.textContent = `${entry.time} · ${entry.direction} · ${entry.type}${
          entry.data === undefined ? "" : ` · ${formatPayload(entry.data).replace(/\s+/g, " ")}`
        }`;
        return item;
      })
    );
  }

  function addLog(direction, type, data) {
    eventLog.add({ time: new Date().toLocaleTimeString(), direction, type, data });
    renderLog();
  }

  function announce(message) {
    elements.announcement.textContent = message;
  }

  function sendHeight(value) {
    if (!messenger) {
      announce("Cannot send height until a valid parent origin is configured.");
      return;
    }
    messenger.send(MESSAGE_TYPES.HEIGHT, value);
    elements.sent.textContent = String(value);
    announce(`Sent height ${value}.`);
  }

  if (resolution.origin) {
    messenger = createMessenger({
      hostWindow: window,
      targetWindow: window.parent,
      targetOrigin: resolution.origin,
      onEvent: event => addLog(event.direction, event.type, event.data)
    });
    messenger.on(MESSAGE_TYPES.READY, () => {
      elements.status.textContent = "Connected";
      elements.status.dataset.state = "connected";
      sendHeight(lastMeasuredHeight);
    });
    messenger.on(MESSAGE_TYPES.DATA, data => {
      elements.payload.textContent = formatPayload(data);
      announce("Received parameter data from the parent application.");
    });
    messenger.start();
    elements.status.textContent = "Waiting for parent application";
  } else {
    elements.status.textContent = resolution.source === "invalid-query" ? "Invalid parent origin" : "Configuration required";
    elements.status.dataset.state = "error";
  }

  const stopObserving = observeHeight({
    documentLike: document,
    hostWindow: window,
    onHeight: height => {
      lastMeasuredHeight = height;
      elements.measured.textContent = String(height);
      if (elements.auto.checked && messenger) sendHeight(height);
    }
  });

  document.querySelector("#add-content").addEventListener("click", () => {
    blockNumber += 1;
    const block = document.createElement("article");
    block.className = "content-block";
    const heading = document.createElement("h3");
    heading.textContent = `Generated block ${blockNumber}`;
    const paragraph = document.createElement("p");
    paragraph.textContent = "This block changes the document height so the parent application can resize this iframe independently.";
    block.append(heading, paragraph);
    elements.content.append(block);
  });

  document.querySelector("#remove-content").addEventListener("click", () => {
    elements.content.lastElementChild?.remove();
  });
  document.querySelector("#send-measured").addEventListener("click", () => sendHeight(lastMeasuredHeight));
  document.querySelector("#send-manual").addEventListener("click", () => sendHeight(parseManualHeight(elements.manual.value)));
  document.querySelector("#send-over-limit").addEventListener("click", () => sendHeight(10001));
  document.querySelector("#send-zero").addEventListener("click", () => sendHeight(0));
  document.querySelector("#send-malformed").addEventListener("click", () => sendHeight("not-a-height"));
  document.querySelector("#clear-log").addEventListener("click", () => {
    eventLog.clear();
    renderLog();
  });

  window.addEventListener("beforeunload", () => {
    stopObserving();
    messenger?.stop();
  }, { once: true });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
}
