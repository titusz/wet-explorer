/** Verify the payload Text-Code contract with the real bundled WebAssembly. */
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { fixtureRecords } from "../../tests/records.ts";
import { loadTextCoder } from "./iscc.ts";

const binary = new Uint8Array(
  await readFile(
    new URL("iscc_wasm_bg.wasm", import.meta.resolve("@iscc/wasm")),
  ),
);

test("the recorded payload matches the supplied Python reference", async () => {
  const encode = await loadTextCoder(binary);
  const record = fixtureRecords("real-head.warc.wet.gz")[2];
  if (!record) throw new Error("Missing reference record");
  expect(encode(record.text)).toBe(
    "ISCC:EAD7FBRUORDROH5TB3F4IYW5YFUPZR5PKR3BEIMQSGSZSY6VMJHDDVQ",
  );
});

test("Unicode compatibility symbols use the generator's normalization of the original payload", async () => {
  const encode = await loadTextCoder(binary);
  expect(encode("℀ ℁ ℅ ℆ ℃ ℉ ㍑")).toBe(
    "ISCC:EADQM55VRQDITOJQLH6D6RUPGWTK5C7FLHWJ35CRXERHLMIEZCUS3ZY",
  );
});

test("empty source text has a valid deterministic code", async () => {
  const encode = await loadTextCoder(binary);
  expect(encode("")).toBe(
    "ISCC:EADSL4F2WZY7KBXBYUZPREWZ26IXUJJOPJJAQMXVSY5IZVHJU7RRFNI",
  );
  expect(await loadTextCoder(binary)).toBe(encode);
});
