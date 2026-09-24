import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = path.join(APP_ROOT, "public");
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);

function normalizeOrigin(value) {
  if (!value) return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid parent origin: ${value}`);
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`Invalid parent origin: ${value}`);
  }
  return url.origin;
}

function readArgument(argv, index, name) {
  const argument = argv[index];
  if (argument === name) {
    if (argv[index + 1] === undefined) throw new Error(`Missing value for ${name}`);
    return { value: argv[index + 1], consumed: 2 };
  }
  if (argument.startsWith(`${name}=`)) {
    return { value: argument.slice(name.length + 1), consumed: 1 };
  }
  return null;
}

export function parseOptions(argv = process.argv.slice(2), env = process.env) {
  const values = {
    host: env.HOST || "127.0.0.1",
    port: env.PORT || "4173",
    parentOrigin: env.PARENT_ORIGIN || ""
  };

  for (let index = 0; index < argv.length; ) {
    let match = readArgument(argv, index, "--host");
    if (match) values.host = match.value;
    else if ((match = readArgument(argv, index, "--port"))) values.port = match.value;
    else if ((match = readArgument(argv, index, "--parent-origin"))) values.parentOrigin = match.value;
    else throw new Error(`Unknown option: ${argv[index]}`);
    index += match.consumed;
  }

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${values.port}`);
  }

  return {
    host: values.host,
    port,
    parentOrigin: normalizeOrigin(values.parentOrigin)
  };
}

function headers(parentOrigin) {
  const frameAncestor = parentOrigin || "'self'";
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy": `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; frame-ancestors ${frameAncestor}; base-uri 'none'; form-action 'none'`,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff"
  };
}

function send(response, status, body, contentType, parentOrigin) {
  response.writeHead(status, {
    ...headers(parentOrigin),
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function resolvePublicFile(rawUrl) {
  const encodedPath = rawUrl.split("?", 1)[0];
  if (/%2f|%5c/i.test(encodedPath)) throw new Error("Encoded path separators are not allowed");
  let pathname;
  try {
    pathname = decodeURIComponent(encodedPath);
  } catch {
    throw new Error("Malformed URL encoding");
  }
  if (pathname.includes("\\") || pathname.split("/").includes("..")) {
    throw new Error("Path traversal is not allowed");
  }
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_ROOT, relativePath);
  if (filePath !== PUBLIC_ROOT && !filePath.startsWith(`${PUBLIC_ROOT}${path.sep}`)) {
    throw new Error("Path traversal is not allowed");
  }
  return filePath;
}

export function createServer(options) {
  const parentOrigin = normalizeOrigin(options.parentOrigin || "");
  return http.createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      send(response, 405, "Method Not Allowed\n", "text/plain; charset=utf-8", parentOrigin);
      return;
    }

    if (request.url?.split("?", 1)[0] === "/config.js") {
      const body = `window.__EXTERNAL_OBJECT_TEST_CONFIG__ = ${JSON.stringify({ parentOrigin })};\n`;
      send(response, 200, request.method === "HEAD" ? "" : body, "text/javascript; charset=utf-8", parentOrigin);
      return;
    }

    let filePath;
    try {
      filePath = resolvePublicFile(request.url || "/");
    } catch {
      send(response, 400, "Bad Request\n", "text/plain; charset=utf-8", parentOrigin);
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error("Not a file");
      const contentType = MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
      response.writeHead(200, {
        ...headers(parentOrigin),
        "Content-Type": contentType,
        "Content-Length": fileStat.size
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(filePath).pipe(response);
    } catch {
      send(response, 404, "Not Found\n", "text/plain; charset=utf-8", parentOrigin);
    }
  });
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    const options = parseOptions();
    const server = createServer(options);
    server.listen(options.port, options.host, () => {
      console.log(`External Object Test App: http://${options.host}:${options.port}`);
      console.log(`Allowed parent origin: ${options.parentOrigin || "not configured"}`);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
