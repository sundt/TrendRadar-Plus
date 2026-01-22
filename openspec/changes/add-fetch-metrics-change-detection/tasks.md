## 1. Implementation
- [ ] 1.1 Define `content_hash` and `changed_count` semantics for a platform fetch result (stable ordering and hashing input).
- [ ] 1.2 Extend fetcher metrics to include a per-platform `content_hash` derived from fetched items.
- [ ] 1.3 Persist last seen per-platform snapshot in memory on the web server and compute `changed_count` for each new metric record.
- [ ] 1.4 Extend `/api/fetch-metrics` response to include the new fields on each metric record.
- [ ] 1.5 Extend `/api/fetch-metrics` summary entries with `avg_changed_count`, `last_changed_count`, `last_content_hash`.
- [ ] 1.6 Add minimal regression checks (manual verification steps) and ensure endpoint remains backward compatible.
- [ ] 1.7 Run `openspec validate add-fetch-metrics-change-detection --strict`.
