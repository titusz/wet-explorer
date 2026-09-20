/** Check every locked dependency before building or deploying the static app. */
import { readFile } from "node:fs/promises";
import { licenseViolations } from "./licenses.ts";

const lock = JSON.parse(
  await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
);
const violations = licenseViolations(lock.packages);
if (violations.length)
  throw new Error(`Unapproved dependency licenses:\n${violations.join("\n")}`);
console.log("Dependency licenses match the runtime and development policies.");
