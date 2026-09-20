/** Verify the planned Text-Code input contract with the real bundled WebAssembly. */
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

test("Unicode compatibility symbols follow the plan's explicit text_clean step", async () => {
  const encode = await loadTextCoder(binary);
  expect(encode("℀ ℁ ℅ ℆ ℃ ℉ ㍑")).toBe(
    "ISCC:EADX76N5IGRGC4CISEWOB6WMDV34I4PTBN5ZES7RHOGQKDA2V3BLFNY",
  );
});

test("empty source text has a valid deterministic code", async () => {
  const encode = await loadTextCoder(binary);
  expect(encode("")).toBe(
    "ISCC:EADSL4F2WZY7KBXBYUZPREWZ26IXUJJOPJJAQMXVSY5IZVHJU7RRFNI",
  );
  expect(await loadTextCoder(binary)).toBe(encode);
});
