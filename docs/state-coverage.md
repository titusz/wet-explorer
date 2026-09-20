# Brief state coverage

All automated examples use local recorded or explicitly invented fixtures. Browser cases run in Chromium, Firefox and WebKit.

| Brief state | Verification |
| --- | --- |
| First visit | `finishing.spec.ts`: inline notice, dismissal, persisted preference, denied storage |
| File host slow or failing | `navigation.spec.ts`: skeleton manifest grid, error, retry; `stream.spec.ts`: retained list and Continue |
| Host asks us to slow down | `stream.spec.ts`: automatic 503 countdown; byte-source and worker tests cover retry exhaustion and abort |
| Browser cannot fetch a single record | `navigation.spec.ts`: blocked range, successful HEAD, compatibility GET opens the same record; byte-source tests cover locating byte events and cancellation |
| Short and stub records | `finishing.spec.ts`: visible muted rows by default, optional Hide short records and Clear filters |
| Missing title | `edge-states.spec.ts`: blank payload displays the host in the ordinary heading |
| Missing language | `edge-states.spec.ts`: Language unknown chip |
| Very long record | `reader.spec.ts`: 500,000 characters, bounded initial rendering, progressive reveal, bounded jump to end |
| Very long URL or title | `edge-states.spec.ts`: truncated values, expansion, full-value copy, no horizontal overflow at 390 px |
| Non-Latin, RTL and mixed direction | `reader.spec.ts`: Arabic and mixed-language records, controls retain interface direction |
| Damaged source characters | `edge-states.spec.ts`: replacement characters remain visible; quiet note inside Technical details |
| Filter with no matches | `finishing.spec.ts`: reading, paused and completed scopes; clearing causes no network request |
| End of file | `finishing.spec.ts`: observed count, dominant languages, short-record share, Next file and Random file; controller tests cover the last manifest line |
| Returning visitor | `finishing.spec.ts`: exact saved record link, visited cell, approved records-plus-byte copy, cleared and denied storage |
| Copy actions | `reader.spec.ts`: canonical link and 1.5-second acknowledgement; `edge-states.spec.ts`: complete title and URL |
| Concern about content | `edge-states.spec.ts`: Common Crawl contact/opt-out link inside Technical details |
| Small screens | `navigation.spec.ts`: ranges of 100 files; `reader.spec.ts`: fixed bottom actions and 390 px layout |
| Keyboard and focus | `accessibility.spec.ts`: ordinary Tab/Shift-Tab through every archive level, reader copy/next/reopen, Escape and filtering in both themes; focus indicators meet 3:1 contrast |
| Standalone permanent link | `navigation.spec.ts`: unknown-prefix explanation, explicit read-from-start action, one exact record request followed by one bounded file request |
| Core visual layouts | `visual.spec.ts`: seven views, two themes and two viewport widths; 28 reviewed snapshots per platform; see `visual-verification.md` |
| Offline reading | `reader.spec.ts`: browser offline state, cached text/raw/next/copy remain usable, no additional request |
| Immediate interaction feedback | `interaction-latency.spec.ts`: theme, notice, loading feedback, pickers, mobile disclosure, reader/raw, details, copy and filter clicks under 100 ms at both widths in all engines |
| ISCC panel | `iscc.spec.ts`: no worker or wasm before the open panel approaches the viewport, reference code within 500 ms, full copying, navigation during loading, failed-load retry and keyboard focus; `iscc-visual.spec.ts`: idle/computing/ready in both themes at both widths |
| Automated accessibility | `axe.spec.ts`: landing, older crawls, both pickers, complete/filtered streams, reader/raw, ISCC/details, permanent record, record error and invalid link; both themes at both widths in all three engines |

The byte-source budget tests consume both 64,000,000 bytes and 64 MiB in 16 sequential bounded requests. Permanent-link paint is checked across three engines with 175 ms of simulated latency. These cases run in CI; the 20,000-row browser benchmark separately exercises deliberate pause/resume requests.

`reader-latency.spec.ts` also covers an approximately 500,000-character first line: full title expansion within 100 ms, scrolling to its end, exact full-value copying, collapse and a 390 px layout. Oversized headings use lossless sections whose off-screen layout is deferred by the browser.

The private-memory and frame budgets pass locally on Windows and Ubuntu and in hosted CI after bounded metadata sharing. Titusz approved private footprint as the counter with resident memory also reported; Linux follows Chromium's anonymous-memory-plus-swap formula and reports private mappings separately. The [completion audit](completion-audit.md) records hosted verification, the tagged Pages deployment, live Chrome/Firefox checks on the published site and the remaining Safari application check.

`record-memory.test.ts` verifies that retained metadata releases oversized unused WARC headers. The test failed before the byte-based header-field decoding change and passes in Windows and Ubuntu measurements. `memory-investigation.md` records both retention fixes, the Linux counter correction, and exact benchmark results.
