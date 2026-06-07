# JSONVault Core Performance And Tiny Production Audit 003

Date: 2026-06-07
Target: `jsonvault-core`
Status: findings drafted, not implemented
Primary target: reliable production use on small machines, including about 0.5 vCPU and 1 GB RAM

This audit builds on Audit 002. Audit 002 fixed major correctness, TTL,
authorization, encryption, webhook safety, and query correctness issues. Audit
003 focuses on the next production layer: predictable resource usage, lossless
behavior, backup safety, and performance on constrained devices without making
JSONVault hard to use.

## Validation Performed

- Inspected the store internals under `internal/store`.
- Inspected HTTP, auth, config, metrics, and server startup paths under
  `internal/httpapi`, `internal/auth`, `internal/config`, and `cmd/jsonvault`.
- Rechecked the current configuration examples and operational docs where they
  affect performance defaults.
- No code was changed for this audit document.
- Tests were not rerun for this documentation-only pass.

## Production Goal

JSONVault should remain easier to operate than MongoDB, Supabase, Firebase, or
Postgres for simple JSON workloads. That means a user should be able to run one
binary with one data directory and a small `.env` file.

The implementation still needs hard resource boundaries so that ease of use does
not turn into hidden risk. Small-server production requires:

- bounded RAM use for writes, reads, queries, search, metrics, auth, and
  background workers;
- bounded disk growth and backup temp usage;
- no silent data or event loss for features presented as durable or reliable;
- predictable latency under broad queries, index builds, FTS rebuilds, TTL
  purges, and backups;
- simple defaults that are safe without requiring database-administrator tuning.

## What Performance Really Depends On

JSONVault performance will not depend on one setting. It depends on the shape of
the workload, the size of documents, and how much work the server can avoid.

It is not only about which database engine is used. Hardware matters. The same
JSONVault build and same dataset can behave very differently on a desktop NVMe
SSD, a cheap VPS, a Raspberry Pi-style board, an old laptop, a NAS, or a server
using slow network storage.

Fast paths:
- point reads by document ID;
- small document writes;
- indexed equality filters on small returned pages;
- cursor-style pagination over key order;
- small collections where a scan is intentionally acceptable.

Slow or risky paths:
- unindexed filters on large collections;
- sorting without an index;
- offset pagination on deep pages;
- broad FTS terms with many matching documents;
- large documents returned in big lists;
- enabling or rebuilding FTS on an existing large collection;
- backup, TTL purge, index build, and broad query running at the same time.

The main performance variables are:

- **Document size**: larger JSON bodies increase read memory, response memory,
  encryption/decryption cost, schema validation cost, indexing cost, backup
  size, and network time.
- **Query shape**: indexed lookups are cheap; unindexed scans are proportional
  to collection size; unindexed sorting is proportional to matched result size.
- **Returned bytes**: `limit` is not enough. A page of 1000 small documents is
  very different from a page of 1000 multi-megabyte documents.
- **Index coverage**: secondary indexes and future index-backed sort paths are
  the difference between predictable latency and full scans.
- **FTS term cardinality**: rare terms are cheap; common terms can produce huge
  posting lists unless capped.
- **bbolt write model**: each database file has one writer. JSONVault can still
  be fast for simple workloads, but long write transactions and rebuilds must be
  batched.
- **Disk behavior**: slow SSD, eMMC, SD card, network storage, or a nearly full
  filesystem will dominate backup, compaction, and write latency.
- **OS page cache and memory limit**: bbolt uses memory-mapped files, so the
  process RSS and OS cache behavior can look different from normal heap-only
  applications.
- **Go GC pressure**: large JSON allocations, result slices, and temporary FTS
  posting lists can create pauses and high CPU on 0.5 vCPU systems.
- **Background work**: TTL purge, backup, index build, FTS rebuild, webhooks,
  metrics, and compaction must be budgeted so they do not starve foreground API
  requests.

Hardware bottlenecks to document and test:

- **CPU**: JSON parsing, schema validation, encryption, hashing, sorting, and
  FTS tokenization can dominate on 0.5 vCPU systems.
- **RAM**: large result sets, response encoding, schema caches, FTS posting
  lists, and Go GC pressure can dominate on 1 GB systems.
- **Disk latency and IOPS**: bbolt commits, backups, compaction, index builds,
  and TTL delete batches depend heavily on storage quality.
- **Free disk space**: backups and compaction may temporarily need close to one
  extra copy of the database.
- **Network**: large document lists and webhook delivery can be limited by
  bandwidth and slow clients, not only by local database speed.
- **Container limits**: a container with 1 GB RAM and shared CPU can behave worse
  than a physical machine with the same headline numbers.

The goal is not to pretend hardware does not matter. The goal is for JSONVault
to detect expensive work early, stay inside configured resource budgets, and
degrade with clear errors instead of crashing, hanging, or silently losing data.

The practical product rule is simple: make the indexed, small-document path
excellent, and make broad or expensive paths bounded, observable, and easy to
fix with clear index recommendations.

## Audit Completeness Verdict

This audit is enough to start the next implementation pass, especially P0. It
identifies the main production blockers that can break the small-server promise:
event loss, query memory spikes, unsafe backup temp usage, and missing
store-level document size limits.

It is not enough by itself to claim production readiness. After implementing P0
and P1 fixes, JSONVault still needs measurement:

- benchmark results before and after each performance fix;
- memory-constrained stress runs;
- backup and restore drills;
- FTS rebuild tests on realistic collections;
- long-running tests that prove caches, rate limiter maps, revocations, and
  webhook limiter maps do not grow forever;
- documented tiny/default/large profile behavior.

So the answer is: the audit is complete enough for a serious fix plan, but the
production claim should wait until the fixes and measurements are complete.

## Severity Model

- P0: release blocker for the stated production goal. Can lose promised data or
  events, exhaust RAM/disk on ordinary use, or make backup/restore unsafe.
- P1: high priority. Serious performance, reliability, or operability issue that
  can hurt production users, especially on 1 GB RAM devices.
- P2: medium priority. Hardening, observability, and product-quality gaps.
- P3: cleanup and future optimization.

## Executive Summary

JSONVault is much stronger after Audit 002, but it is not yet ready to claim
small-server production reliability or lossless behavior. The biggest remaining
risks are:

1. Webhooks and SSE are still best-effort. Events can be dropped when queues are
   full, when a subscriber is slow, or during shutdown. If JSONVault promises
   lossless events, it needs a durable outbox.
2. Query paths can still materialize many full documents in memory for search,
   filtering, sorting, and broad scans. `limit=1000` combined with large
   documents is too high for a 1 GB server.
3. Backups create a full temporary snapshot in the OS temp directory. A database
   backup can fill the wrong disk, double disk usage, and destabilize the host.
4. The HTTP layer has request body limits, but the core store does not have a
   store-level maximum document size contract. Future internal callers can
   bypass the HTTP safety boundary.
5. FTS rebuilds and some background operations still use large write
   transactions or broad scans that can block normal work.
6. Several maps and caches are unbounded: rate limiter keys, webhook target
   limiters, JWT revocations, and compiled schema cache.
7. The database handle cache and default configuration need to be explicitly
   tuned for tiny devices.

The recommended Audit 003 release gate is: fix the P0 resource and lossless
boundaries first, then implement the P1 query, FTS, TTL, cache, and observability
work before making strong production claims for small machines.

## Design Rule For Fixes

Do not solve these findings by making normal users configure many knobs. Prefer
this order:

1. Safe defaults.
2. Automatic backpressure with clear errors.
3. Optional profiles such as `tiny`, `default`, and `large`.
4. Advanced knobs only for operators who need them.

For example, a tiny server profile should reduce maximum body size, list limit,
open database handles, FTS indexed bytes, and background batch sizes together.
Operators should not need to discover ten independent environment variables
before the database is safe on a home server.

## P0 Findings

### P0.1 Webhooks And Realtime Events Are Not Lossless

Evidence:
- `internal/store/events.go` uses in-memory subscriber channels.
- Slow SSE subscribers are unsubscribed when their channel is full.
- `internal/store/events.go` uses a bounded in-memory webhook queue with a
  warning when full.
- `internal/store/webhook.go` drops webhook deliveries when the per-target
  limiter is saturated.
- Webhook queue contents are not persisted before commit or drained durably on
  shutdown.
- Event sequence IDs are process-local and are not stored in the database.

Impact:
- A user can miss webhook events under load.
- A slow or reconnecting SSE client cannot replay missed changes.
- Process restart can lose queued webhook deliveries.
- The product cannot truthfully claim lossless realtime or webhook delivery.

Recommendation:
- Add a durable event outbox stored in the same bbolt write transaction as the
  document mutation.
- Persist event sequence IDs per database instead of only using process memory.
- Deliver webhooks from the durable outbox with status fields such as
  `pending`, `delivering`, `delivered`, `failed`, `next_attempt_at`, and
  `attempt_count`.
- Add a dead-letter state after configured retries, with an admin endpoint to
  inspect and retry failed deliveries.
- Support SSE replay using `Last-Event-ID` with a bounded retention window.
- Document ephemeral `publish` events separately if they should remain
  best-effort.

Required tests:
- Kill/restart after commit and before webhook delivery; delivery resumes.
- Fill the webhook worker queue; committed events remain in the outbox.
- Reconnect SSE with `Last-Event-ID`; missed retained events replay in order.
- Dead-letter records are inspectable and retryable.

### P0.2 Broad Queries Can Exhaust RAM And CPU

Evidence:
- `internal/store/document_read.go` loads full documents into a slice for many
  query paths.
- Sorting calls `sortAndPageDocuments` after materializing matched documents.
- FTS search returns all matching IDs before the HTTP list path loads matching
  documents.
- Unindexed filters scan and parse full collection documents.
- HTTP caps `limit` at 1000 in `internal/httpapi/handlers_document.go`, but
  document write bodies can be 10 MB by default.

Impact:
- A single request can force the server to decrypt, parse, store, sort, and
  return far more data than a 1 GB machine can safely handle.
- Offset pagination still makes the server walk skipped records.
- A broad FTS term can produce a huge candidate list before pagination.
- High CPU scans can starve normal reads and writes on 0.5 vCPU systems.

Recommendation:
- Add a maximum response byte budget, not just a row limit.
- Add a maximum query scan budget measured in documents, bytes, and elapsed
  time.
- Return a clear `413` or `422` style error when a query exceeds the configured
  budget.
- Add cursor pagination and make it the recommended default for production.
- Use index-backed ordering where possible instead of full in-memory sort.
- For sorted unindexed queries, use a bounded top-K heap when the result can fit
  the requested page; otherwise require `allow_scan=true` or an index.
- Limit FTS result expansion before document loading.
- Add response headers that expose scanned documents and whether a query used an
  index.

Required tests:
- Large documents cannot produce responses over the response byte cap.
- Unindexed filters stop at the scan budget and return a useful error.
- Sorting a large collection does not allocate memory proportional to the whole
  collection when an index can satisfy the order.
- FTS broad terms are capped before document materialization.

### P0.3 Backups Can Fill The Wrong Disk

Evidence:
- `internal/store/store.go` `BackupDatabase` writes a full bbolt snapshot to
  `os.CreateTemp("", "jsonvault-backup-*.db")`.
- The temp directory is not configured through JSONVault.
- There is no free-space check before snapshotting.
- There is no explicit per-database or global backup concurrency guard.

Impact:
- A 6 GB database can require about 6 GB of temp space before the response is
  streamed.
- The temp location may be the system drive instead of the data drive.
- On a small server, a backup can fill disk and destabilize the database or OS.
- Concurrent backups can multiply temp usage.

Recommendation:
- Add `JSONVAULT_BACKUP_TEMP_DIR`, defaulting to a directory under
  `JSONVAULT_DATA_DIR`.
- Add a free-space preflight check with a clear error when space is not
  available.
- Allow only one backup per database by default, and optionally one global
  backup at a time on tiny profile.
- Clean up partial temp files after cancellation and failed clients.
- Consider streaming directly from a read transaction only if it does not keep a
  long bbolt read transaction open enough to block file reuse and compaction.
- Document backup storage sizing: at least one full database size plus margin.

Required tests:
- Backup uses the configured temp directory.
- Backup fails before writing when free space is below the database size plus
  margin.
- Canceled backup removes the partial temp file.
- Concurrent backup requests are limited.

### P0.4 Store-Level Document Size Limits Are Missing

Evidence:
- HTTP document writes use `JSONVAULT_MAX_BODY_BYTES`.
- Core store methods such as `CreateDocumentWithTTL`, `PutDocumentWithTTL`, and
  `PatchDocument` validate JSON but do not enforce a store-level maximum
  document size.
- Transactions cap aggregate request body bytes, but single non-transaction
  store writes are limited only by caller behavior.

Impact:
- Future import tools, admin commands, tests, or embedded callers can bypass the
  HTTP boundary and insert documents that make normal reads, queries, indexes,
  FTS, backup, and memory usage unsafe.
- The database has no single resource contract for maximum document size.

Recommendation:
- Add `MaxDocumentBytes` to `store.Options`.
- Wire it from config, using the HTTP max body value unless explicitly
  overridden.
- Enforce it in every store write path, including create, put, patch,
  transaction put/patch, and future import paths.
- Add a separate smaller `MaxPatchBytes` only if partial updates need different
  handling.
- Document the default and the tiny profile default.

Required tests:
- Direct store create/put/patch reject oversized documents.
- HTTP and store limits remain consistent.
- Transaction payload and per-document limits are both enforced.

## P1 Findings

### P1.1 TTL Purge Only Scans Open Database Handles

Evidence:
- `internal/store/store.go` `purgeExpiredDocuments` copies `s.dbs` and only
  scans currently open handles.
- `ListDatabases` can discover all `.db` files, but TTL purge does not use that
  file list.

Impact:
- Expired documents in cold databases can remain indefinitely until the database
  is opened and a later TTL tick runs.
- Disk usage can grow unexpectedly on multi-database small installs.
- The TTL contract becomes dependent on cache state.

Recommendation:
- Make TTL purge enumerate database files with a small per-tick budget.
- Open and close cold databases carefully through the handle cache.
- Add `JSONVAULT_TTL_INTERVAL`, `JSONVAULT_TTL_MAX_DATABASES_PER_TICK`, and
  `JSONVAULT_TTL_MAX_DELETES_PER_TICK` only if profiles cannot cover this.
- Expose TTL purge metrics: databases scanned, documents deleted, errors, and
  last success time.

### P1.2 Store-Level Write Mutex Limits Throughput

Evidence:
- `internal/store/store.go` has one `writeMu` for the entire store.
- Document writes, transactions, collection operations, FTS configuration,
  webhook configuration, and TTL purge use the same mutex.

Impact:
- A write or rebuild in one database can block unrelated databases.
- Tail latency gets worse on tiny CPUs when background work holds the global
  lock.
- The design underuses bbolt's natural per-file isolation.

Recommendation:
- Replace the global write mutex with per-database mutation coordination where
  safe.
- Keep event sequence ordering per database or use a durable global sequence if
  cross-database ordering is a product requirement.
- Keep structural operations serialized only for the affected database.
- Verify TTL, index, schema, webhook, and collection cleanup still commit
  atomically.

### P1.3 FTS Rebuild Runs As One Blocking Write Transaction

Evidence:
- `internal/store/fts.go` `SetFTSConfig` takes `s.writeMu`.
- It deletes old FTS state, saves config, scans all collection documents,
  decrypts/parses them, and indexes them inside one `db.Update`.

Impact:
- Enabling or changing FTS on a large collection can block normal writes for a
  long time.
- A crash or cancellation cannot resume a partial FTS rebuild.
- On 0.5 vCPU, indexing can cause visible service stalls.

Recommendation:
- Rebuild FTS using a resumable build state like secondary indexes.
- Apply small batches with context checks.
- Keep old FTS active until the new build is complete, or mark search as
  rebuilding with a clear response.
- Add FTS build progress metrics and admin status.

### P1.4 FTS Has No Token Or Indexed-Text Budget

Evidence:
- `internal/store/fts.go` `tokenize` deduplicates words but does not cap input
  text, tokens per document, token length, or tokens per query.
- `searchFTS` can load large posting lists into memory.

Impact:
- A single large text field can create many tokens and buckets.
- Broad terms can allocate large ID lists.
- FTS index size can become disproportionate to data size.

Recommendation:
- Add maximum indexed bytes per document.
- Add maximum unique tokens per document and per query.
- Add maximum token length.
- Add optional stopwords for common terms.
- Return clear validation errors when FTS input exceeds limits.

### P1.5 Offset Pagination And In-Memory Sorting Are Not Production Defaults

Evidence:
- HTTP exposes `offset` up to 10000.
- `sortAndPageDocuments` sorts materialized document slices.
- Indexed filter paths still sort in memory when `sort` is requested.

Impact:
- Deep offsets waste CPU even when a small page is returned.
- Sort cost grows with matched result size, not returned page size.
- Users can accidentally create slow queries without understanding indexes.

Recommendation:
- Add cursor pagination and make it the documented default.
- Add compound index support or sorted index traversal for common query shapes.
- Emit query warning headers for unindexed filters, unindexed sorts, and offset
  pagination.
- Keep offset support for convenience, but document it as small-result only.

### P1.6 Handle Cache Can Exceed Its Intended Resource Budget

Evidence:
- `internal/store/store.go` evicts a handle, closes it outside `s.mu`, then
  reacquires `s.mu` and opens the requested database.
- Another goroutine can open a different database while the first goroutine is
  closing an evicted handle.
- `internal/config/config.go` defaults `JSONVAULT_CACHE_ENTRIES` to 1024, while
  `.env.example` recommends 10.

Impact:
- Operators may believe open handles are bounded tighter than they are.
- The default is too high for tiny machines with many databases.
- Concurrent opens can temporarily exceed the configured cache size.

Recommendation:
- Add singleflight or an opener gate per database name.
- Recheck cache capacity after reacquiring `s.mu` and before opening.
- Align config defaults, examples, and docs around a tiny-safe value such as 8
  or 10.
- Add tests that concurrent opens never exceed the configured cache budget after
  settling.

### P1.7 Metrics Scrapes Walk The Data Directory

Evidence:
- `/metrics` calls `s.store.Stats()`.
- `Stats()` calls `filepath.WalkDir` over the data directory on every scrape to
  compute `.db` file sizes.

Impact:
- Frequent Prometheus scrapes can create disk I/O on tiny devices.
- A large data directory makes metrics collection itself a workload.

Recommendation:
- Cache data size stats for a short interval, such as 15 to 60 seconds.
- Update data bytes opportunistically after writes, backup, and delete where
  practical.
- Keep a manual refresh path for admin diagnostics.

### P1.8 Several In-Memory Maps Are Unbounded

Evidence:
- `internal/httpapi/rate_limit.go` keeps a `requests` map keyed by bearer token
  or client IP with no pruning.
- `internal/store/webhook.go` keeps a target limiter map keyed by webhook host.
- `internal/auth/auth.go` stores revoked JWT IDs indefinitely and persists only
  raw IDs, not expiry times.
- `internal/store/schema.go` caches compiled schemas without a maximum size.

Impact:
- Long-lived servers can accumulate memory from old tokens, old IPs, webhook
  hosts, old schemas, and expired revocations.
- Attackers with valid credentials can create many keys or databases to grow
  maps.

Recommendation:
- Add TTL cleanup to the rate limiter map.
- Add expiry-aware revocation records and prune after token expiry.
- Bound compiled schema cache with LRU behavior.
- Bound webhook target limiter entries and remove idle targets.
- Add metrics for cache/map sizes.

### P1.9 bbolt File Growth And Compaction Need A Product Story

Evidence:
- JSONVault uses bbolt files directly.
- Delete-heavy workloads and TTL purges can leave free pages inside the bbolt
  file.
- There is backup support, but no compact/vacuum workflow documented or exposed.

Impact:
- Disk usage may not shrink after deletes.
- Tiny disks can remain full even after users delete documents.
- Users may assume deletes reclaim filesystem space immediately.

Recommendation:
- Add an admin compaction workflow that writes a compacted copy and swaps it
  safely, or document an offline compact procedure.
- Expose free-page and file-size metrics if bbolt stats can provide them safely.
- Warn users when a database has high reclaimable space.

### P1.10 Background Work Needs Admission Control

Evidence:
- Backups, index builds, FTS rebuilds, TTL purge, transactions, and broad queries
  can run at the same time.
- Only some operations are rate-limited at HTTP level.

Impact:
- On 0.5 vCPU, a backup plus FTS rebuild plus broad query can make the server
  look hung.
- Admin operations can starve normal document reads/writes.

Recommendation:
- Add a small internal work scheduler or weighted semaphore.
- Classify work as foreground read, foreground write, admin maintenance, and
  background maintenance.
- Tiny profile should allow very limited concurrent maintenance work.
- Return `429` or `503` with retry information when the server is overloaded.

## P2 Findings

### P2.1 No Tiny Production Profile

The current config exposes individual values, but no profile that makes the
database safe on small devices by default.

Recommendation:
- Add `JSONVAULT_PROFILE=tiny|default|large`.
- Tiny profile should lower body size, list limit, response bytes, cache
  entries, FTS budgets, backup concurrency, query scan budget, and background
  batch sizes.
- Keep explicit env vars able to override profile values.

### P2.2 Query Observability Is Too Thin

Operators need to know why a query was slow without reading code.

Recommendation:
- Add metrics and optional response headers for scanned docs, scanned bytes,
  index used, sort mode, FTS candidate count, response bytes, and query duration.
- Log slow queries with database, collection, query shape, not document bodies.
- Add a simple `explain=true` mode for list queries.

### P2.3 HTTP Server Has No Configured Max Header Size

Evidence:
- `cmd/jsonvault/main.go` sets read, write, idle, and shutdown timeouts.
- `http.Server.MaxHeaderBytes` is not configured.

Impact:
- Header/query abuse relies on Go defaults and upstream proxy behavior.
- Tiny deployments may run without a reverse proxy.

Recommendation:
- Add `JSONVAULT_MAX_HEADER_BYTES` with a conservative default.
- Document recommended reverse-proxy request line and header limits.

### P2.4 JWT Lifetime And Revocation Should Be Explicitly Bounded

Evidence:
- Generated JWTs expire after 90 days.
- Externally signed JWTs can contain any future `exp` if signed with the shared
  secret.
- Revocation records store only `jti`.

Impact:
- A compromised signing secret can produce very long-lived tokens.
- Revocation storage cannot safely prune expired IDs.

Recommendation:
- Enforce a maximum accepted JWT lifetime.
- Store revocation expiry metadata.
- Optionally add issuer and audience checks.
- Provide admin docs for key rotation and token lifetime policy.

### P2.5 SSE Write Errors Are Not Checked

Evidence:
- `internal/httpapi/handlers_subscribe.go` writes keepalives and events and then
  flushes, but does not act on write errors.

Impact:
- Broken connections should usually cancel the request context, but explicit
  error handling would avoid edge-case loops and improve logs.

Recommendation:
- Check `fmt.Fprintf` and flush errors where available through
  `http.ResponseController`.
- Add SSE disconnect metrics.

### P2.6 Restore And Disaster Recovery Are Still Too Manual

Evidence:
- Backup exists as an HTTP endpoint.
- Restore is documented as manual file replacement.

Impact:
- Users can create backups but may not be able to restore confidently under
  pressure.

Recommendation:
- Add a `jsonvault restore` command or an offline documented restore tool.
- Add backup integrity verification.
- Add a restore drill test in CI using a real backup artifact.

### P2.7 Benchmark Coverage Needs To Match The Product Claim

Current benchmarks are useful but too narrow for the new goal.

Recommendation:
- Add benchmarks for indexed reads, unindexed reads, sort, FTS search, FTS
  rebuild, TTL purge, backup, schema validation, encrypted reads/writes, and
  concurrent small writes.
- Run benchmarks with `GOMEMLIMIT` values that simulate 1 GB and 512 MB
  machines.
- Track allocations per operation and fail CI on major regressions for hot
  paths.

## P3 Findings

### P3.1 Add A Production Readiness Checklist

Add a short checklist in docs that covers:

- encryption required mode;
- tested backups and restore;
- tiny/default/large profile choice;
- body and response limits;
- query/index guidance;
- webhook delivery mode;
- disk sizing;
- monitoring and alert thresholds.

### P3.2 Add Friendly Index Recommendations

JSONVault can stay easy to use by advising users instead of forcing them to
learn query planning.

Recommendation:
- Return warning headers for repeated unindexed query shapes.
- Add an admin endpoint that reports frequent slow query shapes and suggested
  indexes.

### P3.3 Add Optional pprof For Local Diagnostics

Recommendation:
- Add an admin-only or localhost-only pprof mode disabled by default.
- Document it for development and self-hosted troubleshooting.

### P3.4 Document bbolt Limits Honestly

JSONVault can be production-grade without pretending to be a distributed
database.

Recommendation:
- Document that each database file has one bbolt writer.
- Recommend multiple databases only when isolation is useful, not as a
  substitute for clustering.
- Document that very large analytical scans are not the target workload.

## Recommended Implementation Order

1. P0 resource and lossless boundaries:
   - durable outbox for committed events and webhooks;
   - query response byte cap and scan budgets;
   - backup temp directory, free-space checks, and backup concurrency guard;
   - store-level maximum document size.
2. P1 small-server performance:
   - TTL scans all databases with budgets;
   - per-database write coordination;
   - online batched FTS rebuild;
   - FTS token and posting-list budgets;
   - cursor pagination and index-backed sort paths.
3. P1/P2 memory and operability:
   - bounded maps and caches;
   - aligned cache defaults;
   - cached metrics stats;
   - work admission control;
   - compaction workflow.
4. P2/P3 product polish:
   - tiny/default/large profiles;
   - query explain and warning headers;
   - restore tooling;
   - benchmark and memory regression suite;
   - production readiness checklist.

## Suggested Tiny Profile Defaults

These are starting points, not final numbers:

- `JSONVAULT_CACHE_ENTRIES=8`
- `JSONVAULT_MAX_BODY_BYTES=1048576`
- default list limit: `50`
- maximum list limit: `200`
- maximum response bytes: `8 MiB`
- maximum unindexed scan: `5000` documents or `16 MiB`, whichever comes first
- maximum FTS indexed text per document: `64 KiB`
- maximum FTS unique tokens per document: `512`
- maximum FTS query tokens: `8`
- webhook workers: `1` or `2`
- backup concurrency: `1`
- background batch size: `100` to `250` documents

The important part is that these values should be applied as one profile. Users
can override them, but they should not need to understand all of them to be safe.

## Release Gate For Audit 003

Before claiming JSONVault is reliable on 0.5 vCPU / 1 GB RAM production
deployments:

- all P0 findings should be fixed and covered by regression tests;
- broad queries should have hard memory and scan budgets;
- backups should be safe on constrained disk;
- event/webhook behavior should be either durable or explicitly documented as
  best-effort;
- tiny profile should be available and documented;
- `go test ./...`, `go test -race ./...`, `go vet ./...`, and the new benchmark
  suite should pass;
- at least one stress run should use a constrained memory setting such as
  `GOMEMLIMIT=512MiB` or `GOMEMLIMIT=768MiB`.
