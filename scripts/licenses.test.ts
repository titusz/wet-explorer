/** Verify real locked licenses and the exact scope of the approved exceptions. */
import { expect, test } from "vitest";
import lock from "../package-lock.json";
import { licenseViolations } from "./licenses.ts";

test("the complete locked dependency tree follows the approved policy", () => {
  expect(licenseViolations(lock.packages)).toEqual([]);
});

test("ISC and MPL are permitted only for development dependencies", () => {
  expect(
    licenseViolations({
      "node_modules/dev-isc": { license: "ISC", dev: true },
      "node_modules/dev-mpl": { license: "MPL-2.0", dev: true },
      "node_modules/runtime-isc": { license: "ISC" },
      "node_modules/runtime-mpl": { license: "MPL-2.0", dev: false },
      "node_modules/dual": { license: "MIT OR Apache-2.0" },
    }),
  ).toEqual([
    "node_modules/runtime-isc: ISC (runtime)",
    "node_modules/runtime-mpl: MPL-2.0 (runtime)",
  ]);
});

test("missing metadata is allowed only for the pinned ISCC package", () => {
  expect(
    licenseViolations({
      "node_modules/@iscc/wasm": { version: "0.6.0" },
      "node_modules/unknown": { version: "0.6.0", dev: true },
    }),
  ).toEqual(["node_modules/unknown: missing license (development)"]);
  expect(
    licenseViolations({ "node_modules/@iscc/wasm": { version: "0.7.0" } }),
  ).toEqual(["node_modules/@iscc/wasm: missing license (runtime)"]);
  expect(
    licenseViolations({
      "node_modules/@iscc/wasm": { version: "0.6.0", license: "GPL-3.0" },
    }),
  ).toHaveLength(1);
});
