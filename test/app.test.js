import assert from "node:assert/strict";
import { test } from "node:test";

import { createEventLog, formatPayload, resolveParentOrigin } from "../public/app.js";

test("resolveParentOrigin gives a valid query value precedence over server configuration", () => {
  assert.deepEqual(
    resolveParentOrigin(
      { parentOrigin: "https://server.example.test" },
      { search: "?parentOrigin=https%3A%2F%2Fquery.example.test" }
    ),
    { origin: "https://query.example.test", source: "query" }
  );
});

test("resolveParentOrigin falls back to valid server configuration", () => {
  assert.deepEqual(
    resolveParentOrigin({ parentOrigin: "http://localhost:8080" }, { search: "" }),
    { origin: "http://localhost:8080", source: "server" }
  );
});

test("resolveParentOrigin reports invalid and missing configuration", () => {
  assert.deepEqual(
    resolveParentOrigin({ parentOrigin: "https://server.example.test" }, { search: "?parentOrigin=javascript%3Aalert(1)" }),
    { origin: "", source: "invalid-query" }
  );
  assert.deepEqual(resolveParentOrigin({}, { search: "" }), { origin: "", source: "missing" });
});

test("formatPayload formats JSON strings and objects without evaluating markup", () => {
  assert.equal(formatPayload('{"recordId":42,"name":"<img src=x>"}'), '{\n  "recordId": 42,\n  "name": "<img src=x>"\n}');
  assert.equal(formatPayload({ userId: 7 }), '{\n  "userId": 7\n}');
  assert.equal(formatPayload("plain text"), "plain text");
  assert.equal(formatPayload(undefined), "No data received.");
});

test("formatPayload handles cyclic values without throwing", () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(formatPayload(cyclic), "[Unserializable payload]");
});

test("createEventLog retains only the newest entries", () => {
  const log = createEventLog(2);
  log.add({ type: "one" });
  log.add({ type: "two" });
  log.add({ type: "three" });
  assert.deepEqual(log.entries(), [{ type: "two" }, { type: "three" }]);
  log.clear();
  assert.deepEqual(log.entries(), []);
  assert.throws(() => createEventLog(0), /positive/i);
});
