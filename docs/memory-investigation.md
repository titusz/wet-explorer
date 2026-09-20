# Memory-budget evidence

Titusz approved private footprint as the native-memory gate, below 150 MiB, with resident memory reported alongside it. The benchmark sums the measured private counters of the isolated tab's renderer processes; it requires a measured private value instead of silently substituting another counter. Windows private commitment and Linux private mappings are supported. The historical measurements below include failures under this approved counter, so the decision alone does not establish a pass.

All readings use the invented 20,000-record fixture over the loopback streaming proxy. The script deliberately pauses and continues every 200 rows. It runs one tab, keeps one response active, and samples page and worker data after garbage collection. A Chromium timeline probe identified the page and worker in the same renderer process, with no extra idle renderer included.

| Diagnostic | Heap and backing bytes | Private bytes | Resident bytes |
| --- | ---: | ---: | ---: |
| Windows, traced, before header fix | 60,196,280 | 158,117,888 | 223,801,344 |
| Windows, tracing disabled, before header fix | 60,245,235 | 150,196,224 | 213,233,664 |
| Ubuntu 24.04, traced, before header fix | 59,784,675 | 164,904,960 | 236,630,016 |
| Windows, traced, with header fix | 56,776,548 | 164,126,720 | 225,673,216 |
| Windows, approved private-counter run | 56,921,337 | 157,503,488 | 222,400,512 |

Disabling tracing did not eliminate the excess. Ubuntu also exceeds the limit, so a Windows-only accounting difference does not explain it. The native counters vary between runs; the lower retained heap does not prove that native usage improved.

## Header retention

The worker heap snapshot showed about 5.5 MB of external string storage associated with 20,000 decoded header blocks, in addition to the intended 32 MiB raw-record cache. Metadata held sliced field strings that kept the entire decoded header alive, including fields no longer needed by the metadata.

`src/cc/record-memory.test.ts` invokes an isolated Node process with explicit collection. It creates eight records with 8 MiB unused headers, drops the parsed header objects and retains their metadata. Before the parser change, retained growth was 67,153,712 bytes. The test failed its 8 MiB ceiling before implementation. After independently decoding header names and values from their byte ranges, growth was 47,128 bytes on Windows and 62,456 bytes on Ubuntu. Titles, URLs, IDs and damage flags remain checked. Unknown headers are still preserved in the parsed record and exact raw data remains available.

The normal fixture's retained browser heap fell by about 3.4 MB. The cache cap, metadata scope, request behavior and native-memory assertion are unchanged. This addresses an avoidable retention bug, but does not finish the tab-memory requirement.

## Frame stability

The first three-engine performance run after the header fix measured maximum frames of 16.8 ms in Chromium, 79.26 ms in Firefox and 55 ms in WebKit. Component updates were at most 0.4, 2 and 1 ms. A focused Firefox/WebKit rerun passed at 42.84 and 35 ms. The isolated spikes remain a stability concern; the limit is still 50 ms and no timing sample was discarded from either result.

The remaining investigation should distinguish allocator reservation and shared process mappings from live application allocations, and establish reproducible frame results.

The first run enforcing the approved private counter still fails: 157,503,488 bytes is 150.21 MiB, 217,088 bytes above the unchanged threshold. Resident memory is 212.10 MiB. All three frame checks pass in that run at 16.8 ms (Chromium), 42.18 ms (Firefox) and 31 ms (WebKit); one response remains active at most. Local artifacts are retained under `.cache/approved-private-budget/`. No payload-cache reduction, counter rounding or timing-sample exclusion was used.
