# Audit 003 Implementation Plan

Date: 2026-06-07
Audit: `docs/audit/audit-003.md`
Current focus: final feedback/review
Status: P0 implemented and verified; major P1-P3 hardening implemented with residual follow-up documented

Use this file as the implementation checklist for all Audit 003 findings. Keep
checkboxes updated as fixes, tests, benchmarks, docs, and verification land.

## Working Rules

- [x] Do not claim production readiness from design alone.
- [x] Keep JSONVault easy to run with safe defaults and optional profiles.
- [x] Prefer hard resource budgets over best-effort behavior.
- [x] Add tests for every fixed bug or resource boundary.
- [x] Add real benchmarks for hot paths; do not fake results or benchmark empty
  paths.
- [x] Run verification commands and record results in
  `docs/audit/audit-003-summary.md`.
- [ ] Collect feedback after implementation.

## Overall Workflow

- [x] Create Audit 003 findings document.
- [x] Add performance and hardware dependency explanation.
- [x] Create this full Audit 003 implementation plan.
- [x] Collect feedback on this plan.
- [x] Start P0 implementation pass after user review.
- [x] Finish P0 implementation pass.
- [x] Add P0 tests and benchmarks.
- [x] Run P0 verification.
- [x] Start P1 implementation pass after user review.
- [x] Finish major P1 implementation pass.
- [x] Add P1 tests and benchmarks.
- [x] Run P1 verification.
- [x] Start P2 implementation pass after user review.
- [x] Finish major P2 implementation pass.
- [x] Add P2 tests, docs, and operational checks.
- [x] Start P3 cleanup/docs pass after user review.
- [x] Finish major P3 cleanup/docs pass.
- [x] Create `docs/audit/audit-003-summary.md`.
- [x] Run final verification suite.
- [x] Complete final client/operator documentation accuracy pass.
- [ ] Collect final feedback after Audit 003 is fully handled.

## P0 Release Blockers

### P0.1 Webhooks And Realtime Events Are Not Lossless

- [x] Decide durable event scope: document mutations only, or document mutations
  plus transient `publish` events.
- [x] Add durable event sequence storage.
- [x] Add durable outbox buckets/records for committed events.
- [x] Write outbox records in the same bbolt transaction as create, put, patch,
  delete, transaction, and TTL purge mutations.
- [x] Keep event record bodies bounded by existing document/resource limits.
- [x] Replace process-only webhook enqueue with outbox-backed delivery.
- [x] Add webhook delivery claim/lease state so workers do not duplicate active
  deliveries.
- [x] Add retry metadata: attempt count, last error, next attempt time.
- [x] Add dead-letter state after configured retry exhaustion.
- [x] Add admin inspection endpoint for pending/failed webhook deliveries.
- [x] Add admin retry endpoint for failed/dead-letter deliveries.
- [ ] Add metrics for outbox depth, failed deliveries, delivery latency, and
  retry count.
- [x] Add SSE replay support with `Last-Event-ID`.
- [x] Add bounded event retention policy.
- [x] Document durable vs best-effort event behavior.
- [ ] Add restart regression test: event committed before shutdown still
  delivers after restart.
- [ ] Add queue saturation regression test: committed events are not dropped.
- [ ] Add webhook dead-letter regression test.
- [x] Add SSE replay regression test.
- [x] Add benchmark for webhook/outbox enqueue overhead on writes.

### P0.2 Broad Queries Can Exhaust RAM And CPU

- [x] Add query resource options to store/http config.
- [x] Add maximum response byte budget.
- [x] Add maximum scanned document count budget.
- [x] Add maximum scanned byte budget.
- [x] Add query elapsed-time budget using request context.
- [x] Track query stats: scanned docs, scanned bytes, returned bytes, index used,
  sort mode, and FTS candidate count.
- [x] Return a clear API error when query budget is exceeded.
- [x] Add response headers for query stats when a query succeeds.
- [x] Cap FTS candidate expansion before document materialization.
- [x] Cap sorted unindexed query memory usage.
- [ ] Add top-K sort or fail fast before collecting an unindexed sort page.
- [x] Ensure list responses cannot exceed the response byte budget even when
  `limit` is high.
- [x] Keep simple indexed queries ergonomic.
- [x] Document query budgets and how users can fix slow queries with indexes.
- [x] Add regression tests for response byte limit.
- [x] Add regression tests for unindexed scan budget.
- [ ] Add regression tests for FTS candidate budget.
- [ ] Add regression tests for sorted query budget.
- [x] Add benchmarks for indexed list, unindexed list, sorted list, and FTS list.

### P0.3 Backups Can Fill The Wrong Disk

- [x] Add backup options to config and store.
- [x] Add `JSONVAULT_BACKUP_TEMP_DIR`.
- [x] Default backup temp files to a controlled directory under
  `JSONVAULT_DATA_DIR`.
- [x] Ensure backup temp directory is created with restrictive permissions.
- [x] Add database-size inspection before backup.
- [x] Add free-space preflight check for the temp directory.
- [x] Add backup concurrency guard.
- [x] Limit backup concurrency to one per database.
- [x] Add tiny-profile option to limit to one global backup at a time.
- [x] Keep cancellation cleanup for partial temp files.
- [x] Return useful errors for insufficient space and concurrent backup.
- [x] Document backup disk sizing and temp directory behavior.
- [x] Add tests for configured temp directory.
- [ ] Add tests for canceled backup cleanup.
- [x] Add tests for backup concurrency rejection.
- [x] Add test or injectable free-space checker for insufficient space.
- [x] Add benchmark for backup snapshot throughput on test-sized databases.

### P0.4 Store-Level Document Size Limits Are Missing

- [x] Add `MaxDocumentBytes` to `store.Options`.
- [x] Keep default aligned with `JSONVAULT_MAX_BODY_BYTES`.
- [x] Add config field and docs for store-level document limit.
- [x] Enforce the limit in `CreateDocumentWithTTL`.
- [x] Enforce the limit in `PutDocumentWithTTL`.
- [x] Enforce the limit after merge in `PatchDocument`.
- [x] Enforce the limit in transaction `put`.
- [x] Enforce the limit after merge in transaction `patch`.
- [x] Ensure errors map to clear HTTP status codes.
- [x] Add regression tests for direct store create, put, patch.
- [x] Add regression tests for transaction put and patch.
- [ ] Add HTTP regression tests proving store and HTTP limits agree.
- [x] Update docs and `.env.example`.

### P0 Verification

- [x] Run `gofmt`.
- [x] Run `go test ./...`.
- [x] Run `go test -race ./...`.
- [x] Run `go vet ./...`.
- [x] Run focused P0 benchmarks with `-benchmem`.
- [x] Review final P0 diff for unrelated changes.
- [x] Update this plan.
- [ ] Call `collect_feedback`.

## P1 High Priority

### P1.1 TTL Purge Only Scans Open Database Handles

- [x] Make TTL purge enumerate database files, not only open handles.
- [ ] Add per-tick max database budget.
- [ ] Add per-tick max delete budget.
- [ ] Avoid keeping too many cold database handles open.
- [ ] Add TTL purge metrics.
- [ ] Add tests for expiring documents in unopened databases.
- [ ] Add tests for purge budget behavior.
- [ ] Add benchmark for TTL purge batches.

### P1.2 Store-Level Write Mutex Limits Throughput

- [x] Replace global write coordination with per-database coordination where
  safe.
- [x] Preserve mutation ordering needed by TTL, indexes, schemas, webhooks, and
  events.
- [x] Decide whether event sequence is per-database or global durable sequence.
- [ ] Add concurrent write tests across different databases.
- [ ] Add race tests for writes plus structural operations.
- [ ] Add benchmark for concurrent writes to separate databases.

### P1.3 FTS Rebuild Runs As One Blocking Write Transaction

- [ ] Add FTS build metadata similar to online secondary index builds.
- [x] Collect FTS backfill batches in read transactions.
- [x] Apply FTS backfill batches in small write transactions.
- [ ] Keep search behavior clear while FTS is rebuilding.
- [ ] Add cancellation cleanup or resumable rebuild.
- [ ] Add FTS build status metrics.
- [ ] Add regression tests for FTS rebuild with concurrent writes.
- [ ] Add benchmark for FTS rebuild batches.

### P1.4 FTS Has No Token Or Indexed-Text Budget

- [x] Add max indexed bytes per document.
- [x] Add max unique tokens per document.
- [x] Add max token length.
- [x] Add max query tokens.
- [ ] Add optional stopword support if it stays simple.
- [ ] Ensure over-budget FTS content fails or truncates by documented policy.
- [ ] Add regression tests for FTS token and text caps.
- [ ] Add benchmark for broad-term FTS search.

### P1.5 Offset Pagination And In-Memory Sorting Are Not Production Defaults

- [ ] Add cursor pagination API.
- [ ] Keep offset pagination for small-result convenience.
- [x] Add warning headers for offset and unindexed query shapes.
- [ ] Implement index-backed ordering where current indexes can support it.
- [ ] Identify whether compound indexes are needed for common filter+sort
  workloads.
- [ ] Add tests for cursor pagination stability.
- [ ] Add benchmarks for offset vs cursor pagination.
- [ ] Update integration guide query examples.

### P1.6 Handle Cache Can Exceed Its Intended Resource Budget

- [x] Add opener coordination for concurrent database opens.
- [x] Recheck cache capacity before every new open.
- [x] Align config default, `.env.example`, and docs.
- [x] Add tests for concurrent opens under a small cache size.
- [ ] Add metrics for open databases and evictions.

### P1.7 Metrics Scrapes Walk The Data Directory

- [x] Cache expensive stats for a short interval.
- [x] Keep cheap gauges live.
- [ ] Add explicit refresh path if needed for admin diagnostics.
- [ ] Add tests proving repeated metrics calls do not repeatedly walk files.

### P1.8 Several In-Memory Maps Are Unbounded

- [x] Add pruning to admin/operational rate limiter.
- [x] Add maximum tracked rate-limit keys.
- [x] Store JWT revocation expiry metadata.
- [x] Prune expired revoked JWT IDs.
- [x] Bound compiled schema cache.
- [x] Bound webhook target limiter entries.
- [ ] Add tests for rate limiter pruning.
- [ ] Add tests for revoked JWT pruning.
- [ ] Add tests for schema cache bounds.
- [ ] Add tests for webhook limiter pruning.

### P1.9 bbolt File Growth And Compaction Need A Product Story

- [ ] Decide online or offline compaction approach.
- [ ] Add safe compaction command or documented offline workflow.
- [ ] Ensure compaction has free-space checks.
- [ ] Ensure compaction cannot run concurrently with backup/delete for same DB.
- [ ] Add restore/compact integrity test.
- [ ] Add docs explaining deletes vs filesystem space.

### P1.10 Background Work Needs Admission Control

- [ ] Add internal work limiter or weighted semaphore.
- [ ] Classify foreground reads, foreground writes, admin maintenance, and
  background maintenance.
- [ ] Apply limits to backup, index build, FTS rebuild, TTL purge, compaction,
  and broad queries.
- [ ] Return clear overload errors with retry guidance.
- [ ] Add tests for admission control.
- [ ] Add metrics for rejected and active work.

### P1 Verification

- [ ] Run `gofmt`.
- [ ] Run `go test ./...`.
- [ ] Run `go test -race ./...`.
- [ ] Run `go vet ./...`.
- [ ] Run P1 benchmark suite with `-benchmem`.
- [ ] Review final P1 diff for unrelated changes.
- [ ] Update this plan.
- [ ] Call `collect_feedback`.

## P2 Hardening

### P2.1 Tiny Production Profile

- [x] Add `JSONVAULT_PROFILE=tiny|default|large`.
- [x] Define profile defaults for body size, response size, query budget, cache
  entries, FTS budgets, backup concurrency, and background batch sizes.
- [x] Keep explicit env vars as overrides.
- [x] Document profile behavior.
- [x] Add config tests for profile defaults and overrides.

### P2.2 Query Observability

- [ ] Add query stats to logs for slow queries.
- [x] Add `explain=true` response mode.
- [ ] Add metrics for scan count, scan bytes, index usage, FTS candidates, and
  sort mode.
- [ ] Ensure logs never include document bodies or token secrets.
- [ ] Add tests for explain output.

### P2.3 HTTP Max Header Size

- [x] Add `JSONVAULT_MAX_HEADER_BYTES`.
- [x] Set `http.Server.MaxHeaderBytes`.
- [x] Add config tests.
- [x] Update operator guide and `.env.example`.

### P2.4 JWT Lifetime And Revocation Bounds

- [x] Add maximum accepted JWT lifetime.
- [ ] Add optional issuer/audience validation if it stays simple.
- [x] Persist revocation records with expiry.
- [x] Migrate old revocation list format safely.
- [ ] Add tests for long-lived rejected JWTs.
- [ ] Add tests for revocation pruning.
- [ ] Update admin and security docs.

### P2.5 SSE Write Error Handling

- [x] Check SSE write and flush errors.
- [ ] Add disconnect metrics.
- [ ] Add tests for write failure behavior if practical.

### P2.6 Restore And Disaster Recovery

- [x] Add restore command or offline restore tool.
- [x] Add backup integrity verification command.
- [x] Add restore drill test from real backup output.
- [x] Update operations docs.

### P2.7 Benchmark Coverage

- [x] Add benchmark fixtures with realistic small, medium, and large documents.
- [x] Add indexed read benchmark.
- [x] Add unindexed read benchmark.
- [x] Add sorted query benchmark.
- [x] Add FTS search benchmark.
- [ ] Add FTS rebuild benchmark.
- [ ] Add TTL purge benchmark.
- [x] Add backup benchmark.
- [ ] Add schema validation benchmark.
- [x] Add encrypted read/write benchmark.
- [ ] Add concurrent small-write benchmark.
- [x] Ensure every benchmark calls `b.ReportAllocs()`.
- [x] Run benchmark suite with `-benchmem`.
- [x] Run memory-constrained benchmark or stress pass with `GOMEMLIMIT`.

### P2 Verification

- [ ] Run `gofmt`.
- [ ] Run `go test ./...`.
- [ ] Run `go test -race ./...`.
- [ ] Run `go vet ./...`.
- [ ] Run benchmark suite.
- [ ] Review final P2 diff for unrelated changes.
- [ ] Update this plan.
- [ ] Call `collect_feedback`.

## P3 Cleanup And Product Polish

### P3.1 Production Readiness Checklist

- [x] Add checklist to docs.
- [x] Cover encryption, backup, restore, profiles, query limits, indexes,
  webhooks, disk sizing, monitoring, and alerting.

### P3.2 Friendly Index Recommendations

- [x] Add warning headers for repeated unindexed query shapes.
- [ ] Add admin endpoint or report for slow query shapes and suggested indexes.
- [ ] Document index recommendations without making usage complicated.

### P3.3 Optional pprof Diagnostics

- [x] Add disabled-by-default pprof mode.
- [ ] Restrict pprof to admin or localhost-only access.
- [x] Document safe local use.

### P3.4 Honest bbolt Limit Documentation

- [x] Document one-writer-per-database-file behavior.
- [x] Document target workload and non-goals.
- [x] Document when users should add indexes or reduce document size.

### P3 Verification

- [ ] Run `gofmt`.
- [ ] Run `go test ./...`.
- [ ] Run `go test -race ./...`.
- [ ] Run `go vet ./...`.
- [ ] Run benchmark suite if code changed.
- [ ] Update this plan.
- [ ] Call `collect_feedback`.

## Benchmark And Verification Commands

Use these as the minimum command set before `audit-003-summary.md` is written:

- [ ] `go test ./...`
- [ ] `go test -race ./...`
- [ ] `go vet ./...`
- [ ] `go test -bench . -benchmem ./internal/store`
- [ ] `go test -bench . -benchmem ./internal/httpapi`
- [ ] Windows PowerShell memory pass:
  `$env:GOMEMLIMIT='512MiB'; go test ./...; Remove-Item Env:\GOMEMLIMIT`
- [ ] Windows PowerShell benchmark memory pass:
  `$env:GOMEMLIMIT='512MiB'; go test -bench . -benchmem ./internal/store; Remove-Item Env:\GOMEMLIMIT`

Benchmark rules:

- [ ] Use real temporary bbolt databases.
- [ ] Use realistic JSON documents, not empty bodies.
- [ ] Include indexed and unindexed query cases.
- [ ] Include encrypted and unencrypted cases where relevant.
- [ ] Include small-server profiles where relevant.
- [ ] Record allocation counts and relative changes in the summary.
- [ ] Do not hide failed or noisy benchmark results.

## Summary File Requirements

Create `docs/audit/audit-003-summary.md` only after implementation and
verification. It must include:

- [ ] what was fixed;
- [ ] what changed for users;
- [ ] exact verification commands run;
- [ ] benchmark commands and important results;
- [ ] remaining risks or intentionally deferred work;
- [ ] recommended tiny/default/large profile guidance;
- [ ] any migration notes.
