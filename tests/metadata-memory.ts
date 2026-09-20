/** Measure metadata retention after discarding unusually large unused WARC headers. */
import { getHeapStatistics } from "node:v8";
import { recordMeta } from "../src/cc/record.ts";
import { parseWarc } from "../src/cc/warc.ts";

/** Include string backing storage as well as ordinary JavaScript heap allocations. */
async function retainedBytes(): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    global.gc?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  const heap = getHeapStatistics();
  return heap.used_heap_size + heap.external_memory;
}

if (!global.gc) throw new Error("Metadata measurement requires --expose-gc.");
const bytes = new TextEncoder().encode(
  [
    "WARC/1.0",
    `X-Unused: ${"x".repeat(8 * 1024 * 1024)}`,
    "WARC-Type: conversion",
    "WARC-Target-URI: https://example.org/retained-record",
    "WARC-Date: 2026-08-07T11:12:14Z",
    "WARC-Record-ID: urn:uuid:00000000-0000-4000-8000-000000000001",
    "Content-Length: 12",
    "",
    "Small record\r\n\r\n",
  ].join("\r\n"),
);
const before = await retainedBytes();
const metadata = [];
for (let index = 0; index < 8; index++) {
  metadata.push(
    recordMeta(parseWarc(bytes), {
      index,
      offset: index,
      length: bytes.length,
    }),
  );
}
const growth = (await retainedBytes()) - before;
// Read every result after collection so their complete metadata remains live.
console.log(JSON.stringify({ growth, metadata }));
