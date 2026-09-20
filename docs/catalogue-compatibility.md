# Selectable crawl range

WET Explorer offers crawls from May 2017 (`CC-MAIN-2017-22`) onward. Titusz approved this limit so the browser retains the plan's strict modern segment and filename grammar. The complete archive-source snapshot remains available for maintenance; builds filter it before generating the public catalogue and year groups. The runtime catalogue parser applies the same rule. Historical WARC parser fixtures and their tests remain in place.

Common Crawl's [May 2017 release announcement](https://commoncrawl.org/blog/may-2017-crawl-archive-now-available) identifies the filename change for WARC, WAT and WET files. The linked [crawler change](https://github.com/commoncrawl/nutch/issues/2) explains the capture-time range in filenames.

A manual check of the two manifests at this boundary confirms the format change. This made two file-list requests, with no WET payload downloads or retries. [Recorded evidence](../data/crawl-format-boundary.json) includes each source, retrieval time, compressed size, SHA-256, total path count, incompatible count and first/last paths.

| Crawl | Manifest paths | Paths rejected by the app's grammar |
| --- | ---: | ---: |
| April 2017, `CC-MAIN-2017-17` | 64,700 | 64,700 |
| May 2017, `CC-MAIN-2017-22` | 56,788 | 0 |

The published catalogue contains 91 crawls through August 2026. Offline tests check the recorded boundary examples, source filtering, generated catalogue and oldest year group. Browser tests check the visible coverage note, eight selectable months in 2017, and absence of a WET request when expanding those months. Ordinary builds and tests never re-fetch these manifests.
