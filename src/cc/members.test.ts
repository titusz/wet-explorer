/** Check gzip member boundaries with recorded and synthetic WET bytes. */
import { readFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { expect, test } from "vitest";
import { type Member, MemberStream } from "./members.ts";

const real = new Uint8Array(
  readFileSync("tests/fixtures/real-head.warc.wet.gz"),
);

/** Feed a chosen partition into the production decoder. */
function decode(chunks: Uint8Array[], start = 0): Member[] {
  const members: Member[] = [];
  const stream = new MemberStream(start, (member) => members.push(member));
  for (const chunk of chunks) stream.push(chunk);
  stream.finish();
  return members;
}

test("recorded offsets and lengths match the independently recorded sample", () => {
  const members = decode([real]);
  expect(members).toHaveLength(50);
  expect(members.slice(1, 7).map((member) => member.offset)).toEqual([
    423, 11692, 13491, 15529, 18851, 32487,
  ]);
  for (const member of members) {
    expect(Buffer.from(member.data)).toEqual(
      gunzipSync(real.subarray(member.offset, member.offset + member.length)),
    );
  }
  expect(members.reduce((sum, member) => sum + member.length, 0)).toBe(
    real.length,
  );
});

test("every two-chunk split preserves records, including header and trailer splits", () => {
  const input = new Uint8Array(
    Buffer.concat([
      gzipSync("first record"),
      gzipSync("العربية 日本語"),
      gzipSync("last record"),
    ]),
  );
  const expected = decode([input]);
  for (let split = 0; split <= input.length; split++) {
    expect(decode([input.subarray(0, split), input.subarray(split)])).toEqual(
      expected,
    );
  }
});

test("real bytes fed singly and in seeded random chunks preserve all records", {
  timeout: 30000,
}, () => {
  const expected = decode([real]);
  expect(
    decode(Array.from(real, (_, index) => real.subarray(index, index + 1))),
  ).toEqual(expected);
  const chunks: Uint8Array[] = [];
  let seed = 17;
  for (let offset = 0; offset < real.length; ) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const end = Math.min(real.length, offset + 1 + (seed % 5000));
    chunks.push(real.subarray(offset, end));
    offset = end;
  }
  expect(decode(chunks)).toEqual(expected);
});

test("an offset read reports absolute file positions and safe resume boundaries", () => {
  const emitted: Member[] = [];
  const stream = new MemberStream(11692, (member) => emitted.push(member));
  stream.push(real.subarray(11692, 15000));
  expect(emitted.map((member) => [member.offset, member.length])).toEqual([
    [11692, 1799],
  ]);
  expect(stream.safeOffset).toBe(13491);
});

test("truncated or invalid gzip cannot be accepted as a completed final record", () => {
  expect(() => decode([real.subarray(0, real.length - 20)])).toThrow();
  expect(() => decode([Uint8Array.of(1, 2, 3, 4)])).toThrow();
});

test("a truncated final gzip trailer cannot produce a permanent record boundary", () => {
  for (let missing = 1; missing <= 8; missing++) {
    expect(() => decode([real.subarray(0, real.length - missing)])).toThrow();
  }
});
