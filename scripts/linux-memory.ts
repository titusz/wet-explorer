/** Parse Linux process counters using Chromium's anonymous-memory-plus-swap footprint. */

/** Read a required kernel memory counter in bytes. */
function kilobytes(source: string, field: string): number {
  const value = new RegExp(`^${field}:\\s+(\\d+) kB$`, "m").exec(source)?.[1];
  if (value === undefined)
    throw new Error(`Missing process memory counter: ${field}`);
  return Number(value) * 1024;
}

/** Preserve resident and private-mapping diagnostics alongside the private-footprint gate. */
export function linuxMemoryCounters(status: string, mappings: string) {
  return {
    residentBytes: kilobytes(mappings, "Rss"),
    privateBytes: kilobytes(status, "RssAnon") + kilobytes(status, "VmSwap"),
    privateMappingBytes:
      kilobytes(mappings, "Private_Clean") +
      kilobytes(mappings, "Private_Dirty"),
  };
}
