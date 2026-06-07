# Audit 003 Implementation Summary

Date: 2026-06-07
Audit: `docs/audit/audit-003.md`
Plan: `docs/audit/audit-003-plan.md`
Status: P0 implemented and verified; major P1-P3 hardening implemented with documented residual follow-up

## What Changed

### Resource Safety

- Added store-level `MaxDocumentBytes` enforcement so direct store callers cannot bypass HTTP body limits.
- Added list-query budgets for scanned documents, scanned bytes, response bytes, and query duration.
- Added query stats headers:
  - `X-JSONVault-Scanned-Documents`
  - `X-JSONVault-Scanned-Bytes`
  - `X-JSONVault-Returned-Bytes`
  - `X-JSONVault-Index-Used`
  - query warning headers for unindexed filters, in-memory sort, and offset pagination.
- Added `explain=true` for list queries.
- Added `JSONVAULT_PROFILE=tiny|default|large` with grouped resource defaults.
- Added `JSONVAULT_MAX_HEADER_BYTES`.

### Backup And Restore

- Backups now use a configured temp directory, defaulting under `JSONVAULT_DATA_DIR`.
- Backups check free space before snapshotting.
- Backups are concurrency-limited.
- Added offline restore command:
  ```bash
  jsonvault restore -data-dir ./data -database my_database -backup ./my_database.db -force
  ```

### Events, SSE, And Webhooks

- Document mutations now write a durable event log and webhook outbox in the same bbolt transaction as the mutation.
- SSE supports replay with `Last-Event-ID` or `?last_event_id=`.
- Webhook workers retry committed events from the durable outbox after restart.
- Failed webhook deliveries are inspectable and retryable through admin endpoints.
- Transient `publish` events remain best-effort and are documented that way.

### Performance And Small-Server Hardening

- TTL purge now scans database files, not only currently open handles.
- Store write coordination is per database instead of one global write mutex.
- FTS indexed text and token counts are capped.
- FTS config backfills existing documents in batches instead of one large write transaction.
- Open database cache rechecks capacity after concurrent opens while preserving nonblocking eviction behavior.
- `/metrics` caches the expensive data-size directory walk briefly.
- Rate limiter, schema cache, webhook limiter, and JWT revocation storage are bounded or prunable.
- Optional local pprof diagnostics can be enabled with `JSONVAULT_PPROF_ADDR`.

### Documentation Audience Split

- `docs/integration-guide.md` is now client-facing: app developers get CRUD,
  query, realtime, transaction, ETag, discovery, validation-error, FTS-query,
  and webhook-receiver behavior without server environment variables or admin
  mutation examples.
- `docs/operator-guide.md` is now server/admin-facing: operators get
  environment profiles, resource limits, encryption modes, admin provisioning
  endpoints, query diagnostics, backups, and maintenance guidance.
- Admin-only schema, index, FTS, webhook, database, collection, key, backup, and
  server-limit controls are documented as host/operator responsibilities.

## Server/Operator Config Added

These environment variables are for the person hosting JSONVault. They are not
the hosted-database user's integration surface. Client/application developers
use the HTTP API behavior documented in `integration-guide.md`.

- `JSONVAULT_PROFILE`
- `JSONVAULT_MAX_DOCUMENT_BYTES`
- `JSONVAULT_MAX_RESPONSE_BYTES`
- `JSONVAULT_MAX_QUERY_SCAN_DOCS`
- `JSONVAULT_MAX_QUERY_SCAN_BYTES`
- `JSONVAULT_MAX_QUERY_DURATION`
- `JSONVAULT_BACKUP_TEMP_DIR`
- `JSONVAULT_BACKUP_CONCURRENCY`
- `JSONVAULT_MAX_HEADER_BYTES`
- `JSONVAULT_PPROF_ADDR`

Client-facing behavior added or clarified:

- `query_limit_exceeded` errors when host-side query budgets are exceeded.
- SSE replay with `Last-Event-ID`.
- Durable webhook behavior for committed document mutations.
- Transient `publish` events remain best-effort.

Operator-facing diagnostics added or clarified:

- Query stats and warning headers.
- `explain=true` on list queries.
- Admin feature provisioning endpoints for schemas, indexes, FTS, webhooks,
  databases, and collections.

## Tests Added

- Direct store oversized document rejection.
- Query response and scan budget rejection.
- Backup temp/free-space check.
- Backup concurrency guard.
- Durable committed event replay.
- Offline restore command.
- Config profile defaults and invalid profile handling.

## Verification Commands

Passed:

```powershell
go test ./...
go test -race ./...
go vet ./...
$env:GOMEMLIMIT='512MiB'; go test -count=1 ./...; Remove-Item Env:\GOMEMLIMIT
```

Benchmark command:

```powershell
go test -bench . -benchmem ./internal/store
```

Important benchmark results from this run:

```text
BenchmarkCreateDocument-24                 22655149 ns/op    61936 B/op     385 allocs/op
BenchmarkGetDocument-24                       18596 ns/op     1234 B/op      15 allocs/op
BenchmarkListDocuments-24                    134133 ns/op    38255 B/op     524 allocs/op
BenchmarkListDocumentsWithoutIndex-24        872200 ns/op   505309 B/op    8031 allocs/op
BenchmarkListDocumentsWithIndex-24            21472 ns/op     2184 B/op      41 allocs/op
BenchmarkListDocumentsSorted-24             1118725 ns/op   892836 B/op   12034 allocs/op
BenchmarkFTSSearch-24                         59037 ns/op    50314 B/op    1126 allocs/op
BenchmarkBackupDatabase-24                  1269420 ns/op  2136961 B/op      33 allocs/op
BenchmarkEncryptedCreateDocument-24        47846639 ns/op    71156 B/op     389 allocs/op
```

The benchmark run took about 652 seconds on the local Windows machine. The
numbers confirm the audit direction: indexed lookups are much cheaper than
unindexed scans, and in-memory sorted queries remain expensive.

## Remaining Follow-Up

These were not hidden or claimed as fully solved:

- Cursor pagination is still a follow-up; offset pagination remains supported with warning headers.
- Index-backed sorted traversal and compound indexes are still follow-up work.
- Full compaction/vacuum workflow is still a follow-up; restore tooling was added.
- Full background work scheduler is still a follow-up; backup concurrency and query budgets are implemented.
- FTS rebuild is batched, but rebuild status metrics and resumable progress metadata should still be added.
- Query stats are available in headers and `explain=true`; Prometheus query-shape metrics are still follow-up.
- Friendly index recommendation endpoint is still follow-up; warning headers are implemented.

## Tiny Profile Guidance

Use `JSONVAULT_PROFILE=tiny` for small devices around 0.5 vCPU / 1 GB RAM. It lowers default body, response, query scan, cache, backup, and timeout budgets together. Override individual env vars only when the workload requires it.

For production, still test with your real document sizes, real query shapes, and real disk. Hardware matters: CPU, RAM, disk latency, free disk space, network speed, and container limits all affect observed performance.
