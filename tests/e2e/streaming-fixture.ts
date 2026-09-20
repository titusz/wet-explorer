/** Stream local fixture ranges over HTTPS so cancellation stops body delivery. */
import { readFile } from "node:fs/promises";
import {
  createServer as createProxy,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createServer } from "node:https";
import { connect, type Socket } from "node:net";
import type { BrowserContext } from "@playwright/test";

export interface StreamingFixture {
  requests: { url: string; range: string | undefined }[];
  unexpected: string[];
  bytesSent: number;
  active: number;
  peak: number;
  close(): Promise<void>;
}

/** Send bounded chunks at 10 Mbit/s and release the producer when a read is cancelled. */
function streamRange(
  data: Buffer,
  state: StreamingFixture,
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "");
  if (!match) {
    state.unexpected.push("Fixture request without a bounded range");
    response.writeHead(400).end();
    return;
  }
  let cursor = Number(match[1]);
  const end = Math.min(Number(match[2]) + 1, data.length);
  if (cursor >= end) {
    response.writeHead(416).end();
    return;
  }
  state.active++;
  state.peak = Math.max(state.peak, state.active);
  response.writeHead(206, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Content-Range,Content-Length",
    "Content-Range": `bytes ${cursor}-${end - 1}/${data.length}`,
    "Content-Length": String(end - cursor),
    "Content-Type": "binary/octet-stream",
  });
  const timer = setInterval(() => {
    if (response.writableNeedDrain) return;
    const chunk = data.subarray(cursor, Math.min(end, cursor + 16384));
    cursor += chunk.length;
    state.bytesSent += chunk.length;
    response.write(chunk);
    if (cursor === end) {
      clearInterval(timer);
      response.end();
    }
  }, 14);
  response.once("close", () => {
    clearInterval(timer);
    state.active--;
  });
}

/** Tunnel the recorded host to loopback without debugger interception of worker fetches. */
export async function streamingFixture(
  context: BrowserContext,
): Promise<StreamingFixture> {
  const [file, key, cert] = await Promise.all([
    readFile(new URL("../fixtures/synthetic-20k.warc.wet.gz", import.meta.url)),
    readFile(new URL("../fixtures/tls/localhost-key.pem", import.meta.url)),
    readFile(new URL("../fixtures/tls/localhost-cert.pem", import.meta.url)),
  ]);
  const state: StreamingFixture = {
    requests: [],
    unexpected: [],
    bytesSent: 0,
    active: 0,
    peak: 0,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections();
      await Promise.all(
        [server, proxy].map(
          (listener) =>
            new Promise<void>((resolve, reject) =>
              listener.close((error) => (error ? reject(error) : resolve())),
            ),
        ),
      );
    },
  };
  const server = createServer({ key, cert }, (request, response) =>
    streamRange(file, state, request, response),
  );
  const sockets = new Set<Socket>();
  const proxy = createProxy((request, response) => {
    state.unexpected.push(request.url ?? "Unexpected proxy request");
    response.writeHead(403).end();
  });
  proxy.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  proxy.on("connect", (request, client, head) => {
    if (request.url !== "data.commoncrawl.org:443") {
      state.unexpected.push(request.url ?? "Unexpected tunnel destination");
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const upstream = connect(43872, "127.0.0.1", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      client.pipe(upstream).pipe(client);
    });
    client.once("close", () => upstream.destroy());
    client.once("error", () => upstream.destroy());
    upstream.once("error", () => client.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(43872, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(43873, "127.0.0.1", resolve);
  });
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:43871") return;
    if (url.origin !== "https://data.commoncrawl.org") {
      state.unexpected.push(url.href);
      return;
    }
    state.requests.push({ url: url.href, range: request.headers().range });
  });
  return state;
}
