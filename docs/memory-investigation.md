# Memory-budget evidence

Titusz approved private footprint as the native-memory gate, below 150 MiB, with resident memory reported alongside it. The benchmark sums the measured private counters of the isolated tab's renderer processes and requires an actual measurement. Windows uses private commitment. Linux uses anonymous resident memory plus swap, following [Chromium's footprint calculation](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/controller/memory_usage_monitor_posix.cc). Linux private mappings are retained as a separate diagnostic. These platform counters have different accounting rules and should not be compared as identical measures.

All readings use the invented 20,000-record fixture over the loopback streaming proxy. The script deliberately pauses and continues every 200 rows. It runs one tab, keeps one response active, and samples page and worker data after garbage collection. A Chromium timeline probe identified the page and worker in the same renderer process, with no extra idle renderer included.

| Diagnostic | Heap and backing bytes | Private footprint | Linux private mappings | Resident bytes |
| --- | ---: | ---: | ---: | ---: |
| Windows, traced, before header fix | 60,196,280 | 158,117,888 | — | 223,801,344 |
| Windows, tracing disabled, before header fix | 60,245,235 | 150,196,224 | — | 213,233,664 |
| Ubuntu 24.04, traced, before header fix | 59,784,675 | not measured | 164,904,960 | 236,630,016 |
| Windows, traced, with header fix | 56,776,548 | 164,126,720 | — | 225,673,216 |
| Windows, approved private-counter run | 56,921,337 | 157,503,488 | — | 222,400,512 |
| Windows, shared metadata | 51,618,251 | 149,999,616 | — | 214,294,528 |
| Ubuntu, shared metadata, mapping counter | 51,327,157 | not measured | 159,588,352 | 230,809,600 |
| Ubuntu, shared metadata, Chromium footprint | 51,638,898 | 116,310,016 | 158,109,696 | 228,155,392 |

Windows native counters varied above and below the threshold during investigation. The historical Linux mapping counter includes file-backed pages and is not Chromium's private footprint; those measurements cannot establish a failure under the approved definition. The corrected parser has tests for swap, distinct mapping totals, and missing or malformed required counters.

## Header retention

The worker heap snapshot showed about 5.5 MB of external string storage associated with 20,000 decoded header blocks, in addition to the intended 32 MiB raw-record cache. Metadata held sliced field strings that kept the entire decoded header alive, including fields no longer needed by the metadata.

`src/cc/record-memory.test.ts` invokes an isolated Node process with explicit collection. It creates eight records with 8 MiB unused headers, drops the parsed header objects and retains their metadata. Before the parser change, retained growth was 67,153,712 bytes. The test failed its 8 MiB ceiling before implementation. After independently decoding header names and values from their byte ranges, growth was 47,128 bytes on Windows and 62,456 bytes on Ubuntu. Titles, URLs, IDs and damage flags remain checked. Unknown headers are still preserved in the parsed record and exact raw data remains available.

The normal fixture's retained browser heap fell by about 3.4 MB. The cache cap, metadata scope, request behavior and native-memory assertion are unchanged. This addresses an avoidable retention bug, but does not finish the tab-memory requirement.

## Frame stability

The first three-engine performance run after the header fix measured maximum frames of 16.8 ms in Chromium, 79.26 ms in Firefox and 55 ms in WebKit. Component updates were at most 0.4, 2 and 1 ms. A focused Firefox/WebKit rerun passed at 42.84 and 35 ms. The isolated spikes remain a stability concern; the limit is still 50 ms and no timing sample was discarded from either result.

The first Windows run enforcing the approved private counter failed at 150.21 MiB, 217,088 bytes above the threshold, with 212.10 MiB resident. All three frame checks passed at 16.8 ms (Chromium), 42.18 ms (Firefox) and 31 ms (WebKit). Local artifacts are retained under `.cache/approved-private-budget/`.

## Repeated metadata

The follow-up considered duplicate metadata values, retained decoder buffers, payload-buffer fragmentation, detached DOM, tracing overhead, and allocator reservation. Fresh page/worker snapshots confirmed about 20,000 separate page allocations for each repeated date, host and type, plus per-record language arrays in both threads. This made sharing repeated metadata the next targeted change; no evidence justified altering the payload cache.

`MetadataPool` shares short types, dates and hosts, and immutable language combinations. Each dictionary holds at most 256 entries, skips oversized values, and clears when its file is discarded. The page shares values again after structured cloning across the worker boundary. Unique titles, URLs and identifiers, complete metadata, exact payload bytes and the 32 MiB LRU capacity are preserved. Tests cover value preservation, language order, input ownership, dictionary eviction and cleanup; worker/controller integration also passes.

The Windows benchmark now retains 49.23 MiB of heap/buffers and 143.05 MiB private footprint, with 204.37 MiB resident. Its three engine frame maxima are 16.8, 41.66 and 34 ms. Ubuntu retains 49.25 MiB of heap/buffers and reports 110.92 MiB private footprint, 150.79 MiB private mappings and 217.59 MiB resident, with a 16.8 ms maximum frame. Both supported platforms pass the unchanged footprint limit. Each run still observes at most one request in flight. No payload-cache reduction, counter rounding or timing-sample exclusion is used. Hosted CI and live-browser release verification remain separate acceptance gates.

Click and record-paint benchmarks also run in the performance projects so all headless Firefox budget measurements use the same 60 Hz clock. Default-clock cached opens recorded 104, 118 and 212 ms outliers, while instrumented opens showed short worker and component work. The standardized 12-case latency run passes across all engines, with a maximum Firefox interaction of 60 ms. Functional projects keep default browser scheduling; the 100 ms interaction and 50 ms frame limits remain unchanged.
