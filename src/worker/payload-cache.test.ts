/** Verify the worker's byte budget and least-recently-used eviction. */
import { expect, test } from "vitest";
import { PayloadCache } from "./payload-cache.ts";

test("touching a payload protects it from the next eviction", () => {
  const cache = new PayloadCache(8);
  cache.put(10, Uint8Array.of(1, 2, 3, 4));
  cache.put(20, Uint8Array.of(5, 6, 7, 8));
  expect(cache.get(10)).toEqual(Uint8Array.of(1, 2, 3, 4));
  cache.put(30, Uint8Array.of(9, 10, 11, 12));
  expect(cache.get(20)).toBeUndefined();
  expect(cache.get(10)).toBeDefined();
  expect(cache.bytes).toBe(8);
});

test("the default cache never retains more than 32 MiB of payload buffers", () => {
  const cache = new PayloadCache();
  const size = 1024 * 1024;
  for (let index = 0; index < 33; index++)
    cache.put(index, new Uint8Array(size).fill(index));
  expect(cache.bytes).toBe(32 * size);
  expect(cache.get(0)).toBeUndefined();
  expect(cache.get(32)?.[0]).toBe(32);
  cache.clear();
  expect(cache.bytes).toBe(0);
  expect(cache.get(32)).toBeUndefined();
});

test("small views cannot retain an oversized backing buffer", () => {
  const cache = new PayloadCache(1024);
  const backing = new Uint8Array(8 * 1024 * 1024);
  backing[4096] = 42;
  cache.put(0, backing.subarray(4096, 4097));
  expect(cache.get(0)?.buffer.byteLength).toBe(1);
  expect(cache.get(0)?.[0]).toBe(42);
  expect(cache.bytes).toBe(1);
});

test("replacement adjusts accounting and oversized records leave other entries usable", () => {
  const cache = new PayloadCache(8);
  cache.put(0, new Uint8Array(4));
  cache.put(1, new Uint8Array(3));
  cache.put(0, new Uint8Array(2));
  expect(cache.bytes).toBe(5);
  expect(cache.put(2, new Uint8Array(9))).toBe(false);
  expect(cache.get(1)).toBeDefined();
  expect(cache.bytes).toBe(5);
});
