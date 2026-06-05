# JSONVault Production Readiness & Security Audit 001

Audit date: 2026-06-06, workspace local date.

Scope inspected:
- `jsonvault-core/internal/store`
- `jsonvault-core/internal/httpapi`
- `jsonvault-core/internal/auth`
- `jsonvault-core/internal/config`
- `jsonvault-core/cmd/jsonvault`
- `docs/integration-guide.md`

Verification run:
- `go test ./...`: passed
- `go test -bench . -benchmem ./internal/store`: passed
- `go run golang.org/x/vuln/cmd/govulncheck@latest ./...`: failed with called Go standard-library vulnerabilities in the local `go1.25.4` toolchain

## Executive Verdict

JSONVault is not ready for internet-facing, multi-tenant, or high-value production use yet.

The strongest parts are the simple storage model, bbolt-backed atomic transactions, strict database/collection/document name validation, mandatory bearer-token auth, constant-time token comparison, request body limiting for document writes, and basic HTTP timeouts.

The blockers are security and operational controls: vulnerable Go toolchain, all-powerful bearer tokens, missing authorization scopes, missing rate/resource limits, unindexed full-scan queries, unbounded open database handles, no backup/restore workflow, weak observability, and unsafe lifecycle handling around database deletion.

## Security-Positive Findings

- Path traversal is mostly controlled by `ValidateDatabaseName`, `ValidateCollectionName`, and `ValidateDocumentID` in `internal/store/validation.go`.
- API keys are not compared directly. `internal/auth/auth.go` hashes configured keys and uses `subtle.ConstantTimeCompare`.
- Auth is mandatory for API routes when an authenticator is provided. `/healthz` is intentionally unauthenticated.
- Document write bodies are capped by `http.MaxBytesReader` in `internal/httpapi/handlers_document.go`.
- Responses include `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.
- bbolt gives atomic single-database transactions and durable commits with default `NoSync=false`.
- There is no SQL parser or dynamic expression evaluator, so classic SQL injection is not the main risk. The query risk is resource exhaustion from scans.

These are good foundations, but they do not offset the production blockers below.

## P0 Blockers

### 1. Vulnerable Go Toolchain

Problem: `govulncheck` reports that code paths are affected by 16 Go standard-library vulnerabilities when built with the local `go1.25.4` toolchain. Examples include `net/http`, `net/url`, `crypto/tls`, `crypto/x509`, `net/mail`, `net/textproto`, and `os` issues. Reported fixes require later Go 1.25 patch releases, up to `go1.25.11`. Called IDs reported by the scanner: `GO-2026-5039`, `GO-2026-5037`, `GO-2026-4986`, `GO-2026-4977`, `GO-2026-4971`, `GO-2026-4947`, `GO-2026-4946`, `GO-2026-4870`, `GO-2026-4865`, `GO-2026-4602`, `GO-2026-4601`, `GO-2026-4341`, `GO-2026-4340`, `GO-2026-4337`, `GO-2025-4175`, and `GO-2025-4155`.

Why it matters: This is a direct security blocker. Several findings are denial-of-service or parsing issues in libraries used by the HTTP server. A production service should not ship with known called vulnerabilities.

Fix:
- Upgrade the production and CI Go toolchain to at least `go1.25.11`, or the newest stable Go patch release available.
- Pin the toolchain in CI and release builds.
- Add `govulncheck ./...` to CI and block releases on called vulnerabilities.
- Re-run `go test ./...` and `govulncheck ./...` after the upgrade.

### 2. All API Keys Have Full Admin and Data Access

Problem: All authenticated callers can list, create, mutate, and delete every database, collection, and document. `NewHandler` applies one bearer-token check to all `/api/v1` routes, including `DELETE /api/v1/{database}` and `DELETE /api/v1/{database}/collections/{collection}`.

Why it matters: A leaked application token or a token shared with one integration can delete all data. There is no least privilege, tenant isolation, admin/data-plane separation, key ID, audit identity, revocation metadata, or scoped authorization.

Fix:
- Introduce scoped API keys or RBAC claims.
- Split management permissions from document read/write permissions.
- Add per-key database and collection allowlists.
- Require elevated admin scope for database and collection deletes.
- Store key IDs and emit them in audit logs, but never log token values.
- Support key rotation and revocation without restarting the server.

### 3. Unbounded Management Request Bodies and Query Cost

Problem: document writes use `readDocumentBodyGin` with `MaxBytesReader`, but database and collection creation use `c.ShouldBindJSON` directly in `handlers_database.go` and `handlers_collection.go`. Query strings are parsed with `URL.Query()` without explicit limits on URL length, filter count, filter key length, or offset.

Why it matters: Attackers with any valid token can send very large JSON bodies to management endpoints or expensive query strings and consume memory/CPU. `govulncheck` also flags a called `net/url` query parsing vulnerability in the current toolchain, increasing the urgency of URL/query limits.

Fix:
- Apply a global request body cap middleware before any binder reads the body.
- Set `http.Server.MaxHeaderBytes`.
- Reject oversized URLs at the reverse proxy and in the app.
- Limit filter count, filter key length, filter value length, `offset`, and total query parameters.
- Add per-token/IP rate limits and concurrent request limits.
- Add tests for oversized management bodies and oversized query strings.

### 4. No Production-Grade Transport Security Enforcement

Problem: the app supports bearer tokens but does not serve TLS itself or enforce that it is behind TLS. The README recommends an HTTPS reverse proxy, but the server can be exposed directly over plaintext HTTP.

Why it matters: Bearer tokens are reusable credentials. If JSONVault is exposed over HTTP, tokens and documents can be captured in transit.

Fix:
- In production, bind JSONVault to localhost or a private network behind an HTTPS reverse proxy.
- Document this as a hard production requirement, not a recommendation.
- Add a production mode that refuses insecure external bind addresses unless explicitly overridden.
- Consider built-in TLS support for deployments without a trusted reverse proxy.

## P1 High-Priority Findings

### 5. Data Files Are Plaintext At Rest

Problem: JSONVault stores bbolt database files directly under `JSONVAULT_DATA_DIR` with filesystem permissions, but no application-level encryption or key management.

Why it matters: Anyone with disk, backup, snapshot, or host-level access can read document contents. This is often unacceptable for credentials, personal data, customer records, and regulated workloads.

Fix:
- Require full-disk or volume encryption in production.
- Keep backups encrypted separately from the host volume.
- Consider application-level envelope encryption for sensitive fields or collections.
- Document the at-rest security model and key rotation story.

### 6. Filtered Queries Are Full Collection Scans

Problem: `ListDocuments` scans every key/value in the bbolt bucket when filters are present. For each document it unmarshals JSON and compares top-level values with `fmt.Sprintf`.

Why it matters: Query latency grows with collection size and document size. One filtered request can hold a read transaction while doing O(N) JSON parsing, which can increase write pressure and become an authenticated denial-of-service path.

Fix:
- Add explicit secondary indexes per collection and field.
- Store index buckets transactionally with document writes, updates, patches, and deletes.
- Add an index management API, for example `POST /api/v1/{db}/collections/{collection}/indexes`.
- Make the query planner reject unindexed filters by default in production, or require an explicit `allow_scan=true` with strict scan limits.
- Replace stringified comparison with typed comparison semantics.

### 7. List Total Counts Add Hidden Scan Work

Problem: `ListDocuments` uses `b.Stats().KeyN` for `X-Total-Count`. bbolt `Bucket.Stats()` traverses the bucket page tree. Listing also walks the cursor to satisfy pagination.

Why it matters: Even unfiltered paginated lists do extra work just to populate the count header. On large buckets this can make small pages unexpectedly expensive.

Fix:
- Maintain per-collection document counts in a metadata bucket updated in the same write transaction.
- Make exact total counts optional, for example `?include_total=true`.
- Prefer keyset pagination, such as `?after_id=...&limit=...`, over large offsets.

### 8. Writes Are Serialized Per Database

Problem: bbolt allows one writable transaction at a time per database file. JSONVault creates one bbolt file per database and each document create/update/delete uses its own `db.Update`.

Why it matters: Write throughput for a busy database is bounded by one writer and one durable commit path. Current small benchmark on this machine shows `BenchmarkCreateDocument` at about `2.32 ms/op`, while point reads are about `16 us/op`.

Fix:
- Document the single-writer-per-database guarantee and expected throughput envelope.
- Add batch or bulk write APIs using bbolt batch/update grouping where correctness permits.
- Consider write queues per database with backpressure.
- Expose bbolt and application write latency metrics.
- For high-write workloads, evaluate sharding data across databases or using a storage engine designed for higher concurrent write throughput.

### 9. Open Database Handles Are Unbounded and `cacheEntries` Is Ignored

Problem: `Store` keeps every opened `*bolt.DB` in `s.dbs` until process shutdown or database deletion. `New(root, cacheEntries)` accepts `cacheEntries`, and config requires it, but the value is not used.

Why it matters: A caller with a token can create or touch many database names and force the process to retain file descriptors and memory mappings. Operators may believe `JSONVAULT_CACHE_ENTRIES` limits memory, but it currently does not.

Fix:
- Implement an LRU/idle closer for open database handles and make `cacheEntries` enforce `max_open_databases`.
- Add per-token and global database count quotas.
- Expose open database count and close errors as metrics/logs.
- If no cache is intended, remove `cacheEntries` from config and docs.

### 10. Database Deletion Can Race In-Flight Operations

Problem: `DeleteDatabase` closes and removes the database file while other goroutines may already hold the same `*bolt.DB` pointer or may reopen the file between map removal and `os.Remove`.

Why it matters: Concurrent deletes can produce failed in-flight operations, remove failures on Windows, reopened handles to a database being deleted, or hard-to-debug lifecycle errors.

Fix:
- Add a per-database lifecycle object with state: active, deleting, deleted.
- Reject new operations once deleting begins.
- Track in-flight operations with a refcount or `sync.WaitGroup`.
- Wait for in-flight operations before closing/removing the file.
- Hold the lifecycle lock through close and remove, and always check close/remove errors.

### 11. Backup, Restore, and Crash-Recovery Posture Is Incomplete

Problem: JSONVault relies on bbolt durability but has no backup API, snapshot command, restore command, scheduled backup guidance, integrity check, or restore test.

Why it matters: ACID writes are not the same as recoverability. Production needs recovery from disk loss, accidental deletes, operator mistakes, software bugs, and corrupted files.

Fix:
- Add a backup command/API using a bbolt read transaction and `tx.WriteTo`.
- Store backups outside `JSONVAULT_DATA_DIR` and test restoring them into a clean data directory.
- Add startup or admin integrity checks using bbolt check tooling or transaction checks.
- Document RPO/RTO expectations.
- Add automated restore drills in CI or release validation.

### 12. Observability and Audit Logging Are Too Thin

Problem: the server uses basic `log.Printf` startup messages and Gin recovery. `handleStoreError` hides internal errors from clients but does not log the underlying error, request ID, actor, database, collection, latency, or operation.

Why it matters: Production incidents become guesswork. Security investigations need an audit trail for deletes, writes, failed auth, and admin actions.

Fix:
- Add structured request logs with request ID, method, route, status, latency, response size, database, collection, and authenticated key ID.
- Log internal errors server-side with stack or cause context.
- Add audit logs for create/update/delete database, collection, and document operations.
- Add metrics: request count, error count, latency histograms, open DB count, bbolt transaction latency, scan count, scanned documents, response bytes, body rejection count.
- Add `/readyz` for readiness and keep `/healthz` for liveness.

### 13. Long Queries Do Not Observe Request Cancellation

Problem: store methods do not accept `context.Context`. A filtered scan can continue after the client disconnects or after the request is no longer useful.

Why it matters: Authenticated clients can start expensive scans and drop connections, leaving the server doing wasted CPU and I/O.

Fix:
- Thread `context.Context` from HTTP handlers into store methods.
- Check `ctx.Err()` during cursor scans, index scans, and long loops.
- Add per-query deadlines and scan budgets.
- Return a clear timeout/cancelled error code.

### 14. Document Type Contract Is Inconsistent

Problem: docs say documents are JSON objects, but `normalizeJSON` accepts any valid JSON value. `PATCH` unmarshals both existing and patch documents into `map[string]interface{}`. A valid stored scalar or array can later make PATCH return an internal server error path such as "corrupt document".

Why it matters: Clients can write data that later breaks API semantics. This creates confusing failures and can turn valid writes into future operational defects.

Fix:
- Enforce JSON object documents on `POST`, `PUT`, and `PATCH` if object-only is the intended model.
- Return `400` for non-object request bodies instead of accepting them.
- If arbitrary JSON values are intended, document that clearly and define PATCH behavior for arrays/scalars.
- Consider implementing RFC 7396 JSON Merge Patch semantics and tests.

### 15. Lost Updates Are Silent

Problem: `PUT` and `PATCH` have no document revision, ETag, or compare-and-swap precondition. Concurrent clients can overwrite each other with last-write-wins behavior.

Why it matters: Silent lost updates are a common production data-integrity failure, especially for application state and user records.

Fix:
- Store a monotonically increasing revision or update timestamp with each document.
- Return `ETag` or `revision` on reads.
- Support `If-Match` or `expected_revision` on write operations.
- Return `409 Conflict` or `412 Precondition Failed` on stale writes.

### 16. Resource Quotas Are Missing

Problem: databases and collections auto-create on document insert, document size defaults to 10 MB, list limit allows up to 1000 documents, and there are no quotas for database count, collection count, document count, total bytes, or per-key request rate.

Why it matters: Any valid key can grow disk, memory-mapped files, response memory, and CPU usage without a production control plane.

Fix:
- Add configurable quotas per token, database, and collection.
- Add disk-space checks before writes.
- Add maximum document size per collection or database.
- Add response byte budgets and streaming responses.
- Add rate limits and circuit breakers for scan-heavy routes.

## P2 Medium-Priority Findings

### 17. Auth Middleware Fails Open If Constructed With a Nil Authenticator

Problem: `NewHandler` only installs auth middleware when `authenticator != nil`. The main binary always constructs an authenticator from required API keys, but the exported handler constructor can create an unauthenticated API if reused incorrectly.

Why it matters: Production wiring mistakes should fail closed. A nil authenticator currently means full unauthenticated access to all API routes.

Fix:
- Make `NewHandler` return an error when the authenticator is nil, or add a separate explicit `NewUnauthenticatedHandlerForTests`.
- Keep tests intentional by using the test-only constructor.
- Add a production startup assertion that auth is enabled.

### 18. Response Construction Can Consume Large Memory

Problem: list responses build a slice of up to 1000 documents, clone each bbolt value, and then JSON-encode the whole slice. With 10 MB documents, the theoretical response size can be multiple gigabytes.

Why it matters: A small number of authenticated list requests can exhaust memory.

Fix:
- Add maximum response bytes.
- Stream JSON arrays carefully or use NDJSON/export endpoints for bulk reads.
- Lower default and maximum `limit` for large documents.
- Track document sizes and enforce page-size budgets.

### 19. Name Validation Is Good but Not Fully Portable

Problem: names allow mixed case and dots. On Windows and some filesystems, case-insensitive collisions and reserved device names can be surprising. Trailing dots/spaces should also be rejected defensively.

Why it matters: `users`, `Users`, and reserved Windows names can behave differently across dev, CI, and production platforms.

Fix:
- Canonicalize database and collection names to lowercase, or reject case-insensitive duplicates.
- Reject Windows reserved device names such as `CON`, `PRN`, `AUX`, `NUL`, `COM1`, and `LPT1`.
- Reject trailing dots and spaces.
- Add cross-platform validation tests.

### 20. API Filter Semantics Are Brittle

Problem: `filter[<field>]` only checks top-level fields and compares values by string formatting. There is no explicit behavior for nested objects, arrays, nulls, numeric precision, repeated filters, or type mismatches.

Why it matters: Clients can get surprising query results and build incorrect assumptions into production code.

Fix:
- Define a typed query contract in `docs/integration-guide.md`.
- Validate filter keys and values at the HTTP boundary.
- Use typed JSON comparison, not `fmt.Sprintf`.
- Return a clear error for unsupported field paths or value types.

### 21. bbolt Production Options Are Not Exposed

Problem: `getDB` uses `bolt.DefaultOptions`, changes only `Timeout`, and does not expose options such as freelist type, initial mmap size, or logger.

Why it matters: large or write-heavy deployments may need bbolt tuning. Operators currently cannot adjust these without code changes.

Fix:
- Add a storage config struct instead of passing only `cacheEntries`.
- Expose vetted options such as open timeout, `InitialMmapSize`, freelist type, and bbolt logger.
- Keep durability defaults safe; do not expose `NoSync` as an easy production toggle.

### 22. Documentation Drift Can Cause Wrong Operations

Problem: `jsonvault-core/README.md` says JSONVault stores databases as directories, collections as subdirectories, documents as JSON files, uses temp-file/sync/rename writes, per-collection locks, and an in-memory sharded LRU cache. The current implementation uses bbolt database files and does not implement the advertised cache.

Why it matters: operators may back up the wrong shape, tune nonexistent caches, or reason incorrectly about locking and durability.

Fix:
- Update README and `docs/integration-guide.md` to match bbolt storage.
- Document that each database maps to one `.db` file.
- Document single-writer behavior and backup requirements.
- Remove or implement cache claims.

## P3 Lower-Priority Findings

### 23. Repeated Filesystem Stat Calls on Read Paths

Problem: some read/list paths call `os.Stat` before opening or using the database file to avoid auto-creating missing databases.

Why it matters: this is usually small, but it adds filesystem round trips to hot paths and can become visible under high request rates or slow storage.

Fix:
- Keep the "do not create on read" behavior, but centralize it in an `openExistingDB` helper.
- Cache known database existence with invalidation on create/delete.
- Measure before optimizing.

### 24. Graceful Shutdown Ignores SIGTERM

Problem: `main.go` uses `signal.NotifyContext(context.Background(), os.Interrupt)` only.

Why it matters: containers and service managers typically send SIGTERM. Without handling SIGTERM, the process may exit without the intended graceful shutdown path.

Fix:
- Include `syscall.SIGTERM` in the signal list.
- Log shutdown start, timeout, and store close errors.
- Consider refusing new requests while shutdown is in progress.

### 25. Dependency Hygiene Should Be Continuous

Problem: `govulncheck` reported additional vulnerabilities in imported/required modules that were not called by current code. They are not immediate findings, but they should be tracked.

Why it matters: future code changes may call vulnerable paths, and stale dependencies increase maintenance risk.

Fix:
- Run `go list -u -m all` during dependency maintenance.
- Run `govulncheck ./...` in CI.
- Keep Gin, bbolt, sonic, and transitive dependencies patched.
- Review dependency changes before release.

## Production Configuration Recommendations

- `JSONVAULT_API_KEY` / `JSONVAULT_API_KEYS`: use long random secrets from a secret manager, not checked-in `.env` files.
- `JSONVAULT_ADDR`: bind to `127.0.0.1:<port>` or a private interface when behind a reverse proxy.
- `JSONVAULT_BASE_URL`: use `https://...` in production.
- `JSONVAULT_DATA_DIR`: use an absolute path on durable storage with restricted filesystem permissions and tested backups.
- `JSONVAULT_MAX_BODY_BYTES`: set per workload; 10 MB is high for many APIs.
- Timeouts: keep read-header, read, write, idle, and shutdown timeouts explicit per deployment.
- Reverse proxy: enforce HTTPS, URL/header/body limits, request rate limits, and access logs.

## Recommended Production Readiness Roadmap

1. Upgrade Go and make `govulncheck` clean for called vulnerabilities.
2. Add scoped auth/RBAC, key IDs, key rotation, and audit logs.
3. Decide and document the at-rest encryption model.
4. Add global request, query, response, rate, and quota limits.
5. Fix database lifecycle concurrency around delete and open-handle caching.
6. Add backup, restore, and integrity-check commands with restore tests.
7. Define and implement indexes or reject unindexed scans in production.
8. Add observability: structured logs, metrics, readiness, and operation audit trails.
9. Enforce JSON object semantics or revise the API contract and PATCH behavior.
10. Add conditional writes with revisions/ETags to prevent silent lost updates.
11. Update README and integration docs to match the bbolt implementation.

## Current Test and Benchmark Snapshot

From `go test -bench . -benchmem ./internal/store` on this workstation:

```text
BenchmarkCreateDocument-24       560   2321763 ns/op   16435 B/op    72 allocs/op
BenchmarkGetDocument-24        72501     16274 ns/op    1088 B/op    12 allocs/op
BenchmarkListDocuments-24      48229     23823 ns/op   19424 B/op   221 allocs/op
```

These benchmarks are useful smoke signals only. They use small documents and a 1000-document list setup, so they do not characterize production-scale filtered scans, large documents, high write contention, backup behavior, or long-running read transactions.
