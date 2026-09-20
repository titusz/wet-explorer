/** Enforce compressed asset budgets against the actual production folder. */
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { gzipSync } from "node:zlib";

/** Walk only build output files, including nested asset folders. */
async function files(dir: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    result.push(...(entry.isDirectory() ? await files(path) : [path]));
  }
  return result;
}

const totals = { js: 0, css: 0, fonts: 0, wasm: 0 };
for (const path of await files("dist")) {
  const bytes = await readFile(path);
  const extension = extname(path);
  if (extension === ".js") totals.js += gzipSync(bytes).length;
  if (extension === ".css") totals.css += gzipSync(bytes).length;
  if (extension === ".woff2") totals.fonts += bytes.length;
  if (extension === ".wasm") totals.wasm += gzipSync(bytes).length;
}
const limits = {
  js: 60 * 1024,
  css: 20 * 1024,
  fonts: 120 * 1024,
  wasm: 257 * 1024,
};
for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
  console.log(`${key}: ${totals[key]} / ${limits[key]} bytes`);
  if (totals[key] > limits[key])
    throw new Error(`${key} exceeds its release budget.`);
}
