# Audit 002 Implementation Plan

Date: 2026-06-07
Audit: `docs/audit/audit-002.md`
Current focus: final feedback/review
Status: Audit 002 implementation verified

Use this file as the implementation checklist for all Audit 002 findings. Keep
checkboxes updated as fixes, tests, and verification land.

## Overall Workflow

- [x] Complete Audit 002 findings document.
- [x] Start P0 implementation pass.
- [x] Finish P0 implementation pass.
- [x] Collect feedback after P0.
- [x] Start P1 implementation pass after user review.
- [x] Finish P1 implementation pass.
- [x] Update docs for P1 API/security behavior.
- [x] Collect feedback after P1.
- [x] Start P2 implementation pass after user review.
- [x] Finish P2 implementation pass.
- [x] Start P3 cleanup pass after user review.
- [x] Finish P3 cleanup pass.
- [x] Collect final feedback after Audit 002 is fully handled.
- [x] Update docs to reflect fixed behavior and remaining limitations.
- [x] Create `docs/audit/audit-002-summary.md`.

## P0 Release Blockers

### P0.1 Schema Validation Deadlock

- [x] Add transaction-local schema lookup helper.
- [x] Add schema validation helper that performs no store I/O.
- [x] Use transaction-local schema validation in `PatchDocument`.
- [x] Use transaction-local schema validation in transaction `put`.
- [x] Use transaction-local schema validation in transaction `patch`.
- [x] Add deadlock regression tests for `PatchDocument`.
- [x] Add deadlock regression tests for `ExecuteTransaction`.
- [x] Verify with `go test ./...`.
- [x] Verify with `go test -race ./...`.

### P0.2 Stale TTL Entries Can Delete Current Documents

- [x] Add current per-document TTL metadata bucket.
- [x] Keep time-ordered TTL bucket as purge index only.
- [x] Replace old TTL entries when a document gets a new TTL.
- [x] Clear old TTL entries when `PUT` writes without TTL.
- [x] Clear old TTL entries when transaction `put` writes without TTL.
- [x] Decide and implement TTL behavior for `PATCH` by preserving existing TTL.
- [x] Clear TTL entries when deleting a document.
- [x] Clear TTL entries when transaction delete removes a document.
- [x] Add regression tests for TTL replacement.
- [x] Add regression tests for clearing TTL on non-TTL `PUT`.
- [x] Add regression tests for transaction `put` clearing TTL.
- [x] Add regression tests for `PATCH` preserving TTL.
- [x] Add regression tests for delete cleanup.

### P0.3 TTL Purge Corrupts Indexes and Counts

- [x] Rewrite purge to verify the index entry matches current per-document TTL.
- [x] Rewrite purge to decrypt the old document before delete.
- [x] Rewrite purge to call `unindexDocumentTx`.
- [x] Rewrite purge to decrement counts only when the document exists.
- [x] Rewrite purge to remove TTL metadata for purged documents.
- [x] Publish TTL delete events only after purge transaction commit.
- [x] Return purge errors instead of ignoring them.
- [x] Log TTL worker purge errors.
- [x] Add regression tests for secondary index cleanup.
- [x] Add regression tests for FTS cleanup.
- [x] Add regression tests for count safety.

### P0.4 Collection Delete Leaves Metadata Behind

- [x] Delete secondary index buckets and metadata.
- [x] Delete schema metadata.
- [x] Delete webhook metadata.
- [x] Delete FTS config.
- [x] Delete FTS forward/reverse index entries.
- [x] Delete TTL metadata.
- [x] Delete collection count metadata.
- [x] Add regression tests for delete/recreate schema cleanup.
- [x] Add regression tests for webhook cleanup.
- [x] Add regression tests for FTS cleanup.
- [x] Add regression tests for TTL cleanup.

### P0 Verification

- [x] Run `gofmt`.
- [x] Run `go test ./...`.
- [x] Run `go test -race ./...`.
- [x] Run `go vet ./...`.
- [x] Review final diff for unrelated changes.
- [x] Call `collect_feedback`.

## P1 High Priority

### P1.1 Sorted Queries Are Expensive and Sometimes Incorrect

- [x] Define sort semantics by JSON type.
- [x] Fix numeric sort ordering.
- [x] Decode sort keys once per document for fallback sort.
- [x] Fix indexed filter plus sort pagination correctness.
- [x] Add regression tests for numeric sorting.
- [x] Add regression tests for indexed filter plus sort.

### P1.2 FTS Configuration Does Not Backfill or Rebuild

- [x] Rebuild FTS when config is set.
- [x] Clear stale collection FTS data before rebuild.
- [x] Add tests for enabling FTS after data exists.
- [x] Add tests for changing FTS fields.

### P1.3 FTS Index Storage Has O(N^2) Write Behavior

- [x] Replace token JSON arrays with scalable postings storage.
- [x] Keep reverse mappings efficient for delete/update.
- [x] Replace nested-loop intersection with set or sorted intersection.
- [x] Add coverage for common token posting storage.

### P1.4 Index Creation Holds the Exclusive Write Lock

- [x] Design index build state.
- [x] Build indexes in batches.
- [x] Prevent queries from using partially built indexes.
- [x] Add cancellation/resume behavior or clear rollback behavior.
- [x] Add tests for writes during index build if async build is implemented.

### P1.5 LRU Eviction Can Freeze Unrelated Database Opens

- [x] Remove eviction candidate under store mutex.
- [x] Release store mutex before waiting on handle gate.
- [x] Apply same pattern to close/shutdown where practical.
- [x] Add concurrency regression test for eviction under active read.

### P1.6 Backup Streams Hold Long Read Transactions

- [x] Snapshot backup to local temp file first.
- [x] Stream snapshot after bbolt read transaction closes.
- [x] Improve backup error behavior before response body starts.
- [x] Add tests for canceled backup and cleanup.

### P1.7 Webhook Dispatch Is Unbounded and Not Durable

- [x] Add bounded queue.
- [x] Add worker pool.
- [x] Add retry/status logging.
- [x] Add per-target limits or circuit breaker.
- [x] Add tests for queue overflow behavior.

### P1.8 SSE Subscribers Can Silently Miss Events

- [x] Disconnect slow subscribers on overflow.
- [x] Add event sequence IDs or gap detection.
- [x] Add tests for overflow behavior.

### P1.9 Mutation Events Are Not Commit-Ordered

- [x] Define ordering contract.
- [x] Add ordered commit dispatcher.
- [x] Add sequence numbers.
- [x] Add concurrency tests for commit/event order.

### P1.10 Normal Write Keys Can Perform Structural Operations

- [x] Require admin or narrower scopes for schemas.
- [x] Require admin or narrower scopes for indexes.
- [x] Require admin or narrower scopes for FTS config.
- [x] Require admin or narrower scopes for webhooks.
- [x] Review database/collection creation scope.
- [x] Add auth regression tests.

### P1.11 JWT API Keys Have No Expiration or Revocation

- [x] Add expiration claims.
- [x] Add issued-at/not-before claims.
- [x] Add token IDs.
- [x] Add revocation storage.
- [x] Add tests for expired/revoked tokens.

### P1.12 Webhook SSRF DNS Rebinding

- [x] Add safe resolver and dialer.
- [x] Dial validated IP while preserving host/TLS behavior.
- [x] Disable or revalidate redirects.
- [x] Add tests for unsafe and rebinding-like cases.

### P1.13 Encryption Lacks Fail-Closed Mode

- [x] Add encryption-required config.
- [x] Fail startup when required key is missing or invalid.
- [x] Reject plaintext reads/writes in required mode unless migration is active.
- [x] Document migration behavior.
- [x] Add config/store tests.

### P1 Verification

- [x] Run `gofmt`.
- [x] Run `go test ./...`.
- [x] Run `go test -race ./...`.
- [x] Run `go vet ./...`.
- [x] Update API/security docs for P1 behavior changes.
- [x] Review final diff for unrelated changes.
- [x] Call `collect_feedback`.

## P2 Medium Priority

- [x] Bound transaction operation count and cumulative bytes.
- [x] Cache compiled schemas and invalidate on schema changes.
- [x] Reject invalid, negative, overflowing, or too-large TTL headers.
- [x] Validate publish payload JSON.
- [x] Restrict `/metrics` to admin or internal listener.
- [x] Validate webhook config on save.
- [x] Return errors from webhook secret generation.
- [x] Add webhook replay protection headers.
- [x] Tighten ETag parsing while preserving proxy tolerance.
- [x] Add field-name validation and validate every public store collection arg.
- [x] Add structured logs and database-level metrics.
- [x] Remove empty secondary-index value buckets after unindex.
- [x] Ensure TTL worker uses handle gating for full transaction.
- [x] Add rate limits for admin/operational endpoints.

## P3 Cleanup

- [x] Avoid extra copies after decryption when plaintext is already owned.
- [x] Replace `(*Store)(nil).GetFTSConfig` with a transaction helper.
- [x] Add internal logs alongside generic HTTP 500 responses.
- [x] Update README/integration docs where behavior was overstated.

### P2/P3 Verification

- [x] Run `gofmt`.
- [x] Run `go test ./...`.
- [x] Run `go test -race ./...`.
- [x] Run `go vet ./...`.
- [x] Review final diff for unrelated changes.
- [x] Call `collect_feedback`.

## Notes

- Pre-P0 baseline verification passed: `go test ./...`, `go test -race ./...`,
  and `go vet ./...`.
- P0 and P1 verification passed with `go test ./...`, `go test -race ./...`,
  and `go vet ./...`.
- Audit 002 P0 through P3 implementation verification passed with
  `go test ./...`, `go test -race ./...`, and `go vet ./...`.
