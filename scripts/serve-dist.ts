/** Serve production files under a real sub-path without SPA fallback. */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve("dist");
const prefix = "/wet-explorer/";
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(
      new URL(request.url ?? "/", "http://localhost").pathname,
    );
    const file = resolve(root, path.slice(prefix.length) || "index.html");
    if (!path.startsWith(prefix) || !file.startsWith(root + sep)) {
      response.writeHead(404).end();
      return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      "Content-Length": bytes.length,
    });
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
}).listen(43871, "127.0.0.1", () =>
  console.log("Static output at http://127.0.0.1:43871/wet-explorer/"),
);
