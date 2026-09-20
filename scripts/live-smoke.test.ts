/** Verify the manual smoke command against recorded bytes without live network access. */
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { liveSmoke, reference } from "./live-smoke.ts";

const fixture = await readFile(
  new URL("../tests/fixtures/real-head.warc.wet.gz", import.meta.url),
);
const member = fixture.subarray(11692, 13491);

test("requests the known member once and verifies its decoded first line", async () => {
  let requests = 0;
  await expect(
    liveSmoke(async (url, init) => {
      requests++;
      expect(url).toBe(reference.url);
      expect(init?.headers).toEqual({ Range: reference.range });
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(member, {
        status: 206,
        headers: { "Content-Range": `bytes 11692-13490/${fixture.length}` },
      });
    }),
  ).resolves.toBe(reference.title);
  expect(requests).toBe(1);
});

test.each([200, 302, 503])(
  "cancels HTTP %i without reading or retrying",
  async (status) => {
    let requests = 0;
    let cancelled = false;
    await expect(
      liveSmoke(async () => {
        requests++;
        return new Response(
          new ReadableStream({
            cancel: () => {
              cancelled = true;
            },
          }),
          { status },
        );
      }),
    ).rejects.toThrow(`HTTP ${status}. No retry.`);
    expect(requests).toBe(1);
    expect(cancelled).toBe(true);
  },
);

test.each([1798, 1800])(
  "rejects a %i-byte response for the fixed member",
  async (length) => {
    await expect(
      liveSmoke(
        async () =>
          new Response(new Uint8Array(length), {
            status: 206,
            headers: { "Content-Range": `bytes 11692-13490/${fixture.length}` },
          }),
      ),
    ).rejects.toThrow(length < member.length ? "truncated" : "exceeded");
  },
);

test("propagates a network failure without a compatibility probe or retry", async () => {
  let requests = 0;
  await expect(
    liveSmoke(async () => {
      requests++;
      throw new TypeError("Network unavailable");
    }),
  ).rejects.toThrow("Network unavailable");
  expect(requests).toBe(1);
});
