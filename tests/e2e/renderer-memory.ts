/** Sample operating-system memory for the renderers of one isolated Chromium tab. */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { BrowserContext } from "@playwright/test";
import { linuxMemoryCounters } from "../../scripts/linux-memory.ts";

const execute = promisify(execFile);

interface ProcessMemory {
  id: number;
  residentBytes: number;
  privateBytes: number | null;
  privateMappingBytes?: number;
}

/** Sample Linux private footprint, resident size, and private mappings without reading memory. */
async function linuxMemory(id: number): Promise<ProcessMemory> {
  const [status, mappings] = await Promise.all([
    readFile(`/proc/${id}/status`, "utf8"),
    readFile(`/proc/${id}/smaps_rollup`, "utf8"),
  ]);
  return { id, ...linuxMemoryCounters(status, mappings) };
}

/** Read the working set and private commitment of the named Windows renderers. */
async function windowsMemory(ids: number[]): Promise<ProcessMemory[]> {
  const command = `$ErrorActionPreference = 'Stop'
  $memorySamples = @(foreach ($memoryProcessId in @(${ids.join(",")})) {
    $memoryProcess = [System.Diagnostics.Process]::GetProcessById($memoryProcessId)
    @{ id = $memoryProcess.Id; residentBytes = $memoryProcess.WorkingSet64; privateBytes = $memoryProcess.PrivateMemorySize64 }
  })
  ConvertTo-Json -InputObject $memorySamples -Compress`;
  const { stdout } = await execute(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { windowsHide: true },
  );
  return JSON.parse(stdout) as ProcessMemory[];
}

/** Read resident size on macOS without adding a system-monitor dependency. */
async function macMemory(id: number): Promise<ProcessMemory> {
  const { stdout } = await execute("ps", ["-o", "rss=", "-p", String(id)]);
  const size = Number(stdout.trim());
  if (!Number.isFinite(size) || size <= 0)
    throw new Error(`Missing resident size for process ${id}`);
  return { id, residentBytes: size * 1024, privateBytes: null };
}

/** Include every renderer in a browser containing only this tab, including its workers. */
export async function rendererMemory(context: BrowserContext) {
  const browser = context.browser();
  if (browser?.contexts().length !== 1 || context.pages().length !== 1)
    throw new Error("Renderer memory requires an isolated one-tab browser.");
  const session = await browser.newBrowserCDPSession();
  try {
    const { processInfo } = await session.send("SystemInfo.getProcessInfo");
    const ids = processInfo
      .filter((process) => process.type === "renderer")
      .map((process) => process.id);
    if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0))
      throw new Error("Renderer process IDs are missing or invalid.");
    const processes =
      process.platform === "win32"
        ? await windowsMemory(ids)
        : await Promise.all(
            ids.map(process.platform === "darwin" ? macMemory : linuxMemory),
          );
    return {
      processes,
      privateBytes: processes.every((entry) => entry.privateBytes !== null)
        ? processes.reduce((sum, entry) => sum + (entry.privateBytes ?? 0), 0)
        : null,
      residentBytes: processes.reduce(
        (sum, entry) => sum + entry.residentBytes,
        0,
      ),
    };
  } finally {
    await session.detach();
  }
}
