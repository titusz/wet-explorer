/** Verify lossless, bounded sharing of repeated record metadata. */
import { expect, test } from "vitest";
import { MetadataPool } from "./metadata-pool.ts";
import { recordMeta } from "./record.ts";
import { parseWarc } from "./warc.ts";

/** Derive independent metadata objects through the production byte parser. */
function metadata(language = "eng") {
  const bytes = new TextEncoder().encode(
    `WARC/1.0\r\nWARC-Type: conversion\r\nWARC-Target-URI: https://example.org/article\r\nWARC-Date: 2026-08-07T10:18:45Z\r\nWARC-Identified-Content-Language: ${language}\r\nContent-Length: 5\r\n\r\nTitle\r\n\r\n`,
  );
  return recordMeta(parseWarc(bytes), { index: 1, offset: 42, length: 100 });
}

test("shares repeated language values without changing metadata or input arrays", () => {
  const pool = new MetadataPool();
  const input = metadata("eng, deu");
  const first = pool.share(input);
  const next = pool.share(metadata("eng, deu"));
  expect(first).toEqual(input);
  expect(next).toEqual(first);
  expect(next.languages).toBe(first.languages);
  expect(first.languages).not.toBe(input.languages);
  expect(Object.isFrozen(first.languages)).toBe(true);
  expect(Object.isFrozen(input.languages)).toBe(false);
  expect(pool.share(metadata("deu, eng")).languages).toEqual(["deu", "eng"]);
});

test("preserves unusual metadata and bounds the shared language dictionary", () => {
  const pool = new MetadataPool();
  const first = pool.share(metadata("eng"));
  for (let index = 0; index < 1000; index++)
    pool.share(metadata(`code${index}`));
  expect(pool.share(metadata("eng")).languages).not.toBe(first.languages);
  for (const language of ["", "eng,deu,spa,fra", "x".repeat(10000)]) {
    const input = metadata(language);
    expect(pool.share(input)).toEqual(input);
  }
  const input = metadata();
  input.type = "x".repeat(10000);
  input.date = null;
  input.host = null;
  expect(pool.share(input)).toEqual(input);
});

test("releases the sharing dictionaries when the file is discarded", () => {
  const pool = new MetadataPool();
  const first = pool.share(metadata());
  pool.clear();
  const next = pool.share(metadata());
  expect(next).toEqual(first);
  expect(next.languages).not.toBe(first.languages);
});
