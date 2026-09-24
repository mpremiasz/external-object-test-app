import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";

import { createServer, parseOptions } from "../server.js";

test("parseOptions applies defaults and accepts environment configuration", () => {
  assert.deepEqual(parseOptions([], {}), {
    host: "127.0.0.1",
    port: 4173,
    parentOrigin: ""
  });
  assert.deepEqual(
    parseOptions([], {
      HOST: "0.0.0.0",
      PORT: "5000",
      PARENT_ORIGIN: "https://parent.example.test"
    }),
    {
      host: "0.0.0.0",
      port: 5000,
      parentOrigin: "https://parent.example.test"
    }
  );
});

test("parseOptions gives command-line arguments precedence", () => {
  assert.deepEqual(
    parseOptions(
      ["--host", "localhost", "--port=6000", "--parent-origin", "https://cli.example.test/"],
      { HOST: "0.0.0.0", PORT: "5000", PARENT_ORIGIN: "https://env.example.test" }
    ),
    { host: "localhost", port: 6000, parentOrigin: "https://cli.example.test" }
  );
});

test("parseOptions rejects invalid ports and parent origins", () => {
  assert.throws(() => parseOptions(["--port", "0"], {}), /port/i);
  assert.throws(() => parseOptions(["--port", "70000"], {}), /port/i);
  assert.throws(() => parseOptions(["--parent-origin", "https://example.test/path"], {}), /origin/i);
  assert.throws(() => parseOptions(["--unknown", "value"], {}), /unknown option/i);
});

async function withServer(options, run) {
  const server = createServer(options);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("server serves static assets, runtime configuration, and security headers", async () => {
  await withServer(
    { host: "127.0.0.1", port: 0, parentOrigin: "https://parent.example.test" },
    async baseUrl => {
      const page = await fetch(`${baseUrl}/`);
      assert.equal(page.status, 200);
      assert.match(page.headers.get("content-type"), /^text\/html/);
      assert.equal(page.headers.get("x-content-type-options"), "nosniff");
      assert.equal(page.headers.get("cache-control"), "no-store");
      assert.match(page.headers.get("content-security-policy"), /frame-ancestors https:\/\/parent\.example\.test/);
      assert.match(await page.text(), /External Object Test App/);

      const config = await fetch(`${baseUrl}/config.js`);
      assert.equal(config.status, 200);
      assert.match(config.headers.get("content-type"), /^text\/javascript/);
      assert.equal(
        await config.text(),
        'window.__EXTERNAL_OBJECT_TEST_CONFIG__ = {"parentOrigin":"https://parent.example.test"};\n'
      );

      assert.equal((await fetch(`${baseUrl}/messenger.js`)).status, 200);
    }
  );
});

test("server returns 404 for missing files and rejects traversal attempts", async () => {
  await withServer(
    { host: "127.0.0.1", port: 0, parentOrigin: "" },
    async baseUrl => {
      assert.equal((await fetch(`${baseUrl}/missing.txt`)).status, 404);
      assert.equal((await fetch(`${baseUrl}/%2e%2e%2fserver.js`)).status, 400);
      assert.equal((await fetch(`${baseUrl}/%2Fetc%2Fpasswd`)).status, 400);
    }
  );
});
