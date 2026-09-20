/** Cover tolerant byte-level parsing with real and invented records. */
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { type Member, MemberStream } from "./members.ts";
import { recordMeta } from "./record.ts";
import { parseWarc } from "./warc.ts";

/** Decode fixture members without performing any network operation. */
function fixture(name: string): Member[] {
  const members: Member[] = [];
  const decoder = new MemberStream(0, (member) => members.push(member));
  decoder.push(new Uint8Array(readFileSync(`tests/fixtures/${name}`)));
  decoder.finish();
  return members;
}

test("keeps warcinfo and parses all modern and historical fixture records", () => {
  for (const name of [
    "real-head.warc.wet.gz",
    "old-crawl-2013-head.warc.wet.gz",
    "old-crawl-2017-head.warc.wet.gz",
  ]) {
    const records = fixture(name).map((member, index) =>
      recordMeta(parseWarc(member.data), { ...member, index }),
    );
    expect(records[0]?.type).toBe("warcinfo");
    expect(
      records
        .slice(1)
        .every((record) => record.type === "conversion" && record.bytes > 0),
    ).toBe(true);
    if (name.includes("2013")) expect(records[1]?.languages).toEqual([]);
  }
});

test("tolerates every synthetic edge while preserving payload bytes", () => {
  const members = fixture("synthetic-edge.warc.wet.gz");
  const parsed = members.map((member) => parseWarc(member.data));
  const records = parsed.map((record, index) =>
    recordMeta(record, { index, offset: 0, length: 1 }),
  );
  expect(records).toHaveLength(13);
  expect(records[1]?.title).toBe("A title after empty lines");
  expect(records[1]?.languages).toEqual([]);
  expect(records[2]?.chars).toBeGreaterThanOrEqual(499999);
  expect(records[3]?.languages).toEqual(["ara"]);
  expect(records[4]?.languages).toEqual(["eng", "ara", "jpn"]);
  expect(records[5]?.damaged).toBe(true);
  expect(new TextDecoder().decode(parsed[5]?.payload)).toContain("�");
  expect(records[6]?.damaged).toBe(true);
  expect(records[6]?.title).toBe("Length disagrees");
  expect(records[7]?.type).toBe("extension");
  expect(records[8]?.short).toBe(true);
  expect(records[9]?.title).toBe("example.org");
  expect(records[10]?.url).toBe("javascript:alert(1)");
  expect(records[10]?.host).toBeNull();
  expect(records[11]?.recordId).toBe("");
  expect(records[11]?.date).toBeNull();
  expect(records[12]?.damaged).toBe(true);
  expect(new TextDecoder().decode(parsed[12]?.payload)).toBe("Keep");
});

test("headers are case-insensitive and unknown fields survive", () => {
  const bytes = new TextEncoder().encode(
    "WARC/1.0\r\nwarc-type: conversion\r\nX-Extension: yes\r\ncontent-length: 4\r\n\r\ntest\r\n\r\n",
  );
  const record = parseWarc(bytes);
  expect(record.headers["warc-type"]).toBe("conversion");
  expect(record.headers["x-extension"]).toBe("yes");
  expect(record.damaged).toBe(false);
});

test("missing delimiter yields a damaged record without throwing", () => {
  expect(
    parseWarc(new TextEncoder().encode("WARC/1.0\r\nWARC-Type: conversion")),
  ).toMatchObject({ damaged: true });
});

test("counts Unicode characters, limits titles, and keeps source bytes distinct", () => {
  const text = `😀${"title".repeat(100)}\n漢字\n`;
  const payload = new TextEncoder().encode(text);
  const record = recordMeta(
    { headers: { "warc-type": "conversion" }, payload, damaged: false },
    { index: null, offset: 11692, length: 1799 },
  );
  expect(record.chars).toBe([...text].length);
  expect(record.bytes).toBe(payload.length);
  expect([...record.title]).toHaveLength(300);
  expect(record.lines).toBe(3);
  expect(record.index).toBeNull();
});

test("derives a bounded title after long whitespace and across UTF-8 chunk boundaries", () => {
  const text = `${" ".repeat(5000)}\n  😀日本語 عنوان\n${"😀漢字\n".repeat(5000)}`;
  const payload = new TextEncoder().encode(text);
  const record = recordMeta(
    { headers: {}, payload, damaged: false },
    { index: 0, offset: 0, length: 1 },
  );
  expect(record.title).toBe("😀日本語 عنوان");
  expect(record.chars).toBe([...text].length);
  expect(record.lines).toBe(text.split("\n").length);
});
