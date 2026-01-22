# Spec Delta: News Viewer Capability

**Capability:** news-viewer  
**Change Type:** ADDED

---

## ADDED Requirements

### Requirement: REQ-VIEWER-011: Fetch Metrics Change Detection

The system SHALL enrich `/api/fetch-metrics` results with content change detection fields so operators can distinguish cached responses from unchanged content.

For each metric record, the system SHALL include:
- `content_hash`: a stable hash representing the fetched item snapshot for the platform.
- `changed_count`: an integer count representing how many items are new compared to the previous snapshot for the same platform.

For each summary entry, the system SHALL include:
- `avg_changed_count`
- `last_changed_count`
- `last_content_hash`

#### Scenario: Cached Response With No Content Changes

- **WHEN** a platform fetch record has `status=cache`
- **AND** the fetched items are identical to the previous snapshot
- **THEN** the metric record SHALL include a `content_hash` equal to the previous snapshot hash
- **AND** the metric record SHALL include `changed_count=0`

#### Scenario: Success Response With Partial Content Changes

- **WHEN** a platform fetch record has `status=success`
- **AND** the fetched items contain some new items compared to the previous snapshot
- **THEN** the metric record SHALL include a new `content_hash`
- **AND** the metric record SHALL include `changed_count` equal to the number of newly appearing items

#### Scenario: Summary Aggregates Recent Change Activity

- **WHEN** the user calls `/api/fetch-metrics?limit=2000`
- **THEN** each platform entry in `summary` SHALL include `avg_changed_count`
- **AND** SHALL include `last_changed_count` and `last_content_hash` matching the last metric record for that platform
