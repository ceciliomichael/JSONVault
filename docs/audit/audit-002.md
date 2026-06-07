# JSONVault Core Production Audit 002

Date: 2026-06-07
Target: `jsonvault-core`
Status: P0 through P3 remediation implemented and verified in the working tree

This audit focuses on reliability, data safety, security boundaries, and
performance risks in the Go database engine and HTTP API. The earlier draft was
found at `../docs/audit/audit-002.md`; this file is the repo-local audit for
`jsonvault-core/docs/audit/audit-002.md`.

## Validation Performed

- Inspected the database engine under `internal/store`.
- Inspected the HTTP/API/auth/config boundaries under `internal/httpapi`,
  `internal/auth`, and `internal/config`.
- Compared behavior against the root integration guide where relevant.
- Ran `go test ./...`: pass.
- Ran `go test -race ./...`: pass.
- Ran `go vet ./...`: pass.

Passing tests do not clear every production risk below. The P0/P1 paths now have
focused regression coverage in the working tree, while P2/P3 hardening and
broader scale/operability testing remain open.

## Implementation Status

The original findings below are retained as the audit rationale. The current
working tree has implemented and verified the P0 through P3 remediation passes;
see `docs/audit/audit-002-plan.md` for the live checklist and verification
status.

## Severity Model

- P0: release blocker. Can hang the database, lose data, corrupt query results,
  or create a major security exposure.
- P1: high priority. Serious production reliability, performance, or security
  issue that should be fixed before broad production use.
- P2: medium priority. Hardening, operability, or correctness gap that can hurt
  users under edge cases or scale.
- P3: cleanup. Maintainability or efficiency issue with lower immediate blast
  radius.

## Executive Summary

JSONVault has a compact architecture and a useful API surface, but the current
implementation should not be considered production-ready yet. The largest risks
are:

1. Schema-enforced `PATCH` and transaction writes can deadlock because they open
   a read transaction while already inside a bbolt write transaction.
2. TTL state is not tied to the current document version. Stale TTL entries can
   delete updated documents, delete documents whose TTL should have been
   removed, corrupt counts, and leave dangling secondary/FTS index entries.
3. Collection deletion does not clean all collection-owned metadata, so schemas,
   webhooks, FTS config/indexes, and TTL entries can survive and affect a
   recreated collection.
4. Sorted query behavior is both expensive and incorrect in some indexed cases.
5. FTS config does not backfill existing documents and does not rebuild/clean
   stale tokens when fields change.
6. Webhook and SSE delivery are not backpressure-safe and can silently lose
   user-visible events.
7. Read/write API keys can perform structural operations such as schema, index,
   FTS, webhook, collection, and database creation. This is too much authority
   for normal application keys.

The recommended release gate is: fix all P0 items, then the P1 query/event/auth
items, then add regression tests for each fixed path before treating the engine
as reliable.

## P0 Findings

### P0.1 Schema Validation Can Deadlock Inside Write Transactions

Evidence:
- `internal/store/document_write.go:190` `PatchDocument` opens `db.Update`.
- Inside that write transaction it calls `s.ValidateDocument`.
- `internal/store/transaction.go:14` `ExecuteTransaction` does the same for
  `put` and `patch` operations.
- `internal/store/schema.go:91` `ValidateDocument` calls `GetSchema`.
- `internal/store/schema.go:55` `GetSchema` opens `db.View` on the same bbolt
  database.

Impact:
- `PATCH` against a collection with a schema can hang.
- Transaction `put`/`patch` against schema-enforced collections can hang.
- A hung write path can block later writes because bbolt has a single writer.

Recommendation:
- Do not call `ValidateDocument` from inside `db.Update`.
- Add a `validateDocumentWithSchema(schemaBytes, doc)` helper that has no I/O.
- For single-document writes, fetch schema before opening `db.Update`.
- For transactions, either prefetch all required collection schemas before
  `db.Update`, or add a `getSchemaTx(tx, collection)` helper and validate using
  the already-open transaction.

Required tests:
- `PatchDocument` with schema succeeds or returns validation errors without
  deadlock.
- Transaction `put` and `patch` with schema succeed or return validation errors
  without deadlock.
- Use short test timeouts to catch deadlocks.

### P0.2 TTL Entries Can Delete Updated or Non-Expiring Documents

Evidence:
- `internal/store/document_write.go:349` `setDocumentTTL` only appends a key
  shaped as `expireAt + collection + id`.
- `PutDocumentWithTTL` can add a new TTL but never removes an older TTL for the
  same document.
- `PutDocumentWithTTL` with no TTL does not clear an existing TTL.
- `DeleteDocument` does not remove the document's TTL entry.
- `internal/store/store.go:105` `purgeExpiredDocuments` trusts any expired TTL
  key and deletes `collection/id`.

Impact:
- A document created with a 1 minute TTL and later updated with a 1 hour TTL can
  still be deleted at the 1 minute mark.
- A document updated without `X-Expire-In` can still be deleted by an old TTL.
- A manually deleted document can leave a TTL key that later decrements counts
  again.
- This is direct user data loss.

Recommendation:
- Store TTL metadata by document ID as the source of truth, for example
  `__ttl_by_doc__/collection/id -> expireAt`.
- Keep the time-ordered bucket as an index only.
- On every `put`, `patch`, and `delete`, remove or replace the old TTL index.
- During purge, verify the expired key still matches the current document TTL
  before deleting.

Required tests:
- Updating a document with a longer TTL does not delete at the old expiry.
- Updating a TTL document without TTL clears expiration if that is the intended
  API contract.
- Deleting a TTL document does not corrupt counts when the old TTL later expires.

### P0.3 TTL Purge Corrupts Indexes and Counts

Evidence:
- `internal/store/store.go:148` deletes document payloads directly.
- It does not decrypt the old payload and call `unindexDocumentTx`.
- It ignores errors from `b.Delete`, `incrementCollectionCountTx`, `c.Delete`,
  and the outer `db.Update`.
- It decrements collection count even if the document did not exist.

Impact:
- Secondary indexes can retain document IDs for expired documents.
- FTS can retain document IDs/tokens for expired documents.
- Indexed reads can traverse ghost IDs.
- Collection counts can become wrong.
- TTL worker failures are invisible.

Recommendation:
- Use the same delete path as `DeleteDocument`: load existing payload, decrypt,
  unindex, delete, remove TTL metadata, then decrement count only when the
  document existed.
- Return and log TTL purge errors.
- Publish delete events only after a successful transaction commit.

Required tests:
- Expiring an indexed document removes it from secondary indexes.
- Expiring an FTS-indexed document removes it from FTS results.
- Expiring an already-deleted document does not decrement counts.

### P0.4 Deleting a Collection Leaves Collection-Owned Metadata Behind

Evidence:
- `internal/store/collection.go:85` `DeleteCollection` removes the collection
  bucket, collection count, and B-tree index metadata.
- It does not remove:
  - schema entries in `_schemas`
  - webhook records in `_webhooks`
  - FTS config in `_fts_config`
  - FTS forward/reverse entries in `_fts_index` and `_fts_reverse`
  - TTL entries in `__ttl_index__`

Impact:
- Recreating a collection can unexpectedly inherit its old schema.
- Webhooks can fire for a recreated collection without the user reconfiguring
  them.
- FTS search can return ghost IDs or stale results.
- Old TTL entries can delete documents in a recreated collection if IDs collide
  or if IDs are user-supplied.

Recommendation:
- Treat collection deletion as ownership cleanup for every per-collection
  bucket/key prefix.
- Add helpers such as `deleteSchemaTx`, `deleteWebhooksTx`, `deleteFTSTx`, and
  `deleteTTLForCollectionTx`.
- Add tests that delete and recreate a collection with prior schema, webhook,
  FTS, indexes, and TTL state.

## P1 Findings

### P1.1 Sorted Queries Are Expensive and Sometimes Incorrect

Evidence:
- `internal/store/document_read.go:18` `ListDocuments` materializes matching
  documents before sorting.
- `document_read.go:274` and `document_read.go:275` unmarshal JSON inside the
  sort comparator, causing repeated `O(N log N)` unmarshals.
- The indexed single-filter path applies `limit` before sorting, so
  `?filter[field]=...&sort=other_field` sorts only the first index-page, not the
  full matching set.
- Numeric sort compares `encodeIndexValue` strings, so values like `10` and `2`
  are ordered lexicographically, not numerically.

Impact:
- Sorted pages can be wrong.
- Large sorted reads can spike CPU and memory or run out of memory.
- Users cannot trust sorted pagination in production.

Recommendation:
- Define sort semantics by JSON type.
- Decode the sort key once per document if using in-memory fallback.
- Prefer index-backed sort traversal for indexed fields.
- Apply offset/limit during cursor traversal when possible.
- Add explicit tests for numeric sort and indexed filter plus sort.

### P1.2 FTS Configuration Does Not Backfill or Rebuild

Evidence:
- `internal/store/fts.go:23` `SetFTSConfig` only stores config and creates FTS
  buckets.
- It does not index existing documents when FTS is enabled.
- When configured fields change, old tokens remain until each document is
  rewritten.

Impact:
- Enabling FTS after data exists silently misses existing documents.
- Changing FTS fields can leave stale search results.
- The integration guide describes FTS as a reliable indexed search feature, but
  the index can be incomplete.

Recommendation:
- Make `SetFTSConfig` rebuild the collection FTS index, or mark the index
  `building` and expose status.
- Clear old FTS entries for the collection before rebuilding.
- Add tests for enabling FTS after documents exist and changing configured
  fields.

### P1.3 FTS Index Storage Has O(N^2) Write Behavior

Evidence:
- `internal/store/fts.go:118` `indexFTS` stores each token's document IDs as a
  single JSON array.
- Each insert for a common token unmarshals the full array, scans it, appends,
  and marshals it again.
- `internal/store/fts.go:220` `searchFTS` intersects arrays with nested loops.

Impact:
- Common terms become increasingly expensive to write.
- Large collections can spend most write time rewriting common token arrays.
- Search with common terms can stall read transactions.

Recommendation:
- Use nested buckets or key pairs: `token -> docID -> empty`.
- Store reverse mappings as doc-owned keys for efficient delete.
- Intersect by scanning the smallest posting list first and using a set, or by
  sorted linear intersection.

### P1.4 Index Creation Holds the Exclusive Write Lock for the Full Backfill

Evidence:
- `internal/store/index.go:89` `CreateIndex` opens one `db.Update`.
- It scans every document, decrypts it, unmarshals JSON, and writes index
  entries inside that single write transaction.

Impact:
- Building an index on a large collection can block all writes to that database
  for a long time.
- If the request is canceled midway, the full backfill rolls back and has to be
  restarted.

Recommendation:
- Build indexes in batches.
- Read source documents with short read transactions.
- Apply index entries with short write transactions.
- Track build status and prevent queries from using a partially built index.

### P1.5 LRU Eviction Can Freeze Unrelated Database Opens

Evidence:
- `internal/store/store.go:187` `getDB` holds `s.mu`.
- During eviction it deletes the oldest handle, sets state, and then waits on
  `oldHandle.gate.Lock()` while still holding `s.mu`.
- `Close` has similar head-of-line blocking while holding `s.mu`.

Impact:
- A slow read, backup, or query on one database can block opening or reusing
  every other database while eviction waits.
- With a low cache size and many tenants, this can look like a server-wide
  freeze.

Recommendation:
- Select and remove the eviction candidate while holding `s.mu`.
- Release `s.mu`.
- Then wait on the handle gate and close the bbolt file.
- Apply the same pattern to shutdown/close paths where practical.

### P1.6 Backup Streams Hold a Long-Lived Read Transaction

Evidence:
- `internal/store/store.go:293` `BackupDatabase` opens `db.View`.
- It calls `tx.WriteTo` directly into the HTTP response writer.
- `internal/httpapi/server.go:335` starts sending backup headers before the
  backup operation can fail.

Impact:
- A slow client can hold a bbolt read transaction open for a long time.
- bbolt cannot reclaim pages while old read transactions are open, so database
  files can grow rapidly under concurrent writes.
- Backup errors are hard to report after headers/body start streaming.

Recommendation:
- Create a local snapshot/temp file first using a bounded internal writer.
- Close the bbolt read transaction.
- Then stream the snapshot file to the client.
- Consider admin-only async backup jobs with status and download endpoints.

### P1.7 Webhook Dispatch Is Unbounded and Not Durable

Evidence:
- `internal/store/events.go` calls `go s.TriggerWebhooks(event)` for every
  event.
- `internal/store/webhook.go:121` then starts another goroutine per matching
  webhook.
- Responses, non-2xx statuses, and delivery errors are ignored.
- There is no retry, dead-letter queue, rate limit, or delivery log.

Impact:
- A write burst can create large numbers of goroutines and outbound sockets.
- Slow or failing receivers silently lose events.
- Operators cannot diagnose webhook delivery failures.

Recommendation:
- Use a bounded queue and worker pool.
- Persist delivery attempts if delivery matters.
- Track status, retries, and last error per webhook.
- Apply per-target rate limits and circuit breakers.

### P1.8 SSE Subscribers Can Silently Miss Events

Evidence:
- `internal/store/events.go` sends events into a per-subscriber channel of size
  100.
- If the channel is full, the `default` case silently drops the event and keeps
  the connection open.

Impact:
- Clients can believe they are synchronized while missing mutations.
- This can corrupt application state for users relying on real-time sync.

Recommendation:
- On overflow, disconnect the slow subscriber and require a full resync.
- Include monotonic event sequence IDs so clients can detect gaps.
- Consider per-collection replay windows if reliable subscriptions are a goal.

### P1.9 Mutation Events Are Not Commit-Ordered

Evidence:
- `internal/store/transaction.go:218` publishes transaction events only after
  the write transaction commits.
- Each event is published independently.
- Concurrent writers can race in event publication after their commits.

Impact:
- Subscribers can receive events out of commit order.
- A client replaying events as state changes can end up with stale state.

Recommendation:
- Introduce a commit event dispatcher that assigns a sequence number after each
  successful write transaction.
- Publish events through one ordered queue per database or globally, depending
  on the consistency contract.

### P1.10 Normal Write Keys Can Perform Structural Operations

Evidence:
- `internal/httpapi/handlers_schema.go:36` allows schema changes with
  `read_write`.
- `internal/httpapi/handlers_index.go:39` and `handlers_index.go:61` allow
  index create/delete with `read_write`.
- `internal/httpapi/handlers_fts.go:14` allows FTS config changes with
  `read_write`.
- `internal/httpapi/handlers_webhook.go:15` allows webhook changes with
  `read_write`.
- `internal/httpapi/handlers_database.go` and `handlers_collection.go` allow
  database/collection creation with `read_write`.

Impact:
- A normal app write key can alter validation, change performance-critical
  indexes, add outbound webhooks, and create storage structures.
- Compromised app keys have too much operational power.

Recommendation:
- Require `admin` for schema, index, FTS, webhook, database, and collection
  management.
- Keep `read_write` scoped to document CRUD, transactions, and optional
  transient publish.
- If self-service structural changes are required, add narrower scopes such as
  `schema_admin`, `index_admin`, or `webhook_admin`.

### P1.11 JWT API Keys Have No Expiration or Revocation

Evidence:
- `internal/auth/auth.go:69` `GenerateKey` creates JWTs with `scope`,
  `database`, and `collection`, but no `exp`, `iat`, `nbf`, `jti`, issuer, or
  audience.
- `Authenticate` only validates signature and signing method.

Impact:
- Generated keys are valid indefinitely.
- A leaked key cannot be revoked without rotating `JSONVAULT_JWT_SECRET`, which
  invalidates every generated key at once.

Recommendation:
- Add mandatory expiration.
- Add `jti` and a revocation/blocklist store.
- Add issuer/audience validation if keys can cross environments.
- Add admin endpoints for key listing/revocation if JSONVault owns key
  lifecycle.

### P1.12 Webhook SSRF Protection Is Vulnerable to DNS Rebinding

Evidence:
- `internal/store/webhook.go:177` `isSafeURL` resolves hostnames and rejects
  private/local IPs.
- `http.Client.Do` performs its own DNS resolution later.

Impact:
- DNS rebinding can allow a hostname to pass validation and then resolve to an
  internal address at connect time.
- This can expose local services or cloud metadata endpoints.

Recommendation:
- Use a custom `http.Transport` with `DialContext`.
- Resolve once, validate the selected IP, and dial that exact IP while
  preserving the original host for TLS/SNI where needed.
- Revalidate redirects or disable redirects for webhooks.

### P1.13 Encryption Does Not Have a Production Fail-Closed Mode

Evidence:
- `internal/store/crypto.go:16` returns plaintext when the key length is not
  exactly 32 bytes.
- `internal/store/crypto.go:47` treats any document not prefixed with `0x00` as
  plaintext.
- `internal/config/config.go:32` makes encryption optional.

Impact:
- A deployment can run with no at-rest encryption while product messaging says
  the database is secure/encrypted.
- Mixed plaintext/encrypted data can make compliance and incident response
  difficult.

Recommendation:
- Add an explicit `JSONVAULT_ENCRYPTION_REQUIRED=true` mode.
- In required mode, fail startup if the key is missing or invalid.
- In required mode, reject plaintext documents instead of accepting legacy
  fallback.
- Document the migration behavior for existing plaintext data.

## P2 Findings

### P2.1 Transaction Size and Work Are Unbounded Beyond HTTP Body Size

Evidence:
- `internal/store/transaction.go:14` processes every operation in one bbolt
  write transaction.
- The HTTP layer only limits request body bytes, not operation count,
  collections touched, or total write work.

Impact:
- A large transaction can block all writes for a long time.
- Large response/event slices can increase memory pressure.

Recommendation:
- Add maximum operation count and maximum cumulative document bytes.
- Consider per-transaction timeout and context checks inside each operation.
- Document transaction limits in the integration guide.

### P2.2 Schema Validation Recompiles Schemas on Every Write

Evidence:
- `internal/store/schema.go:91` uses `gojsonschema.Validate` with schema bytes
  for each document validation.

Impact:
- High write throughput with schemas pays repeated schema parse/compile cost.

Recommendation:
- Cache compiled schemas per database/collection/schema revision.
- Invalidate cache on `SetSchema`.
- Keep validation outside write transactions.

### P2.3 Invalid or Overflowing TTL Headers Are Silently Ignored

Evidence:
- `internal/httpapi/handlers_document.go` `parseExpireIn` returns `0` on parse
  error.
- Negative or overflowing values can effectively disable TTL.

Impact:
- A user typo can turn an expiring document into a persistent document without a
  client-visible error.

Recommendation:
- Return `400 Bad Request` for invalid, negative, zero-if-disallowed, or
  too-large `X-Expire-In` values.
- Add a documented maximum TTL.

### P2.4 Publish Accepts Invalid JSON but Reports Success

Evidence:
- `internal/httpapi/handlers_subscribe.go:70` `handlePublish` reads raw bytes
  and publishes them as `json.RawMessage`.
- It does not validate that the payload is valid JSON.

Impact:
- The endpoint can return `202 Accepted` for data that subscribers cannot
  serialize.
- The integration guide says publish accepts JSON, but invalid data can be
  silently dropped by subscriber serialization.

Recommendation:
- Validate `json.Valid(body)`.
- If only JSON objects are supported, enforce object shape too.
- Return `400 Bad Request` on invalid publish payloads.

### P2.5 Metrics Are Available to Any Valid Token

Evidence:
- `/metrics` is registered outside `/api/v1`.
- Auth middleware protects it, but there is no admin scope check.

Impact:
- Collection-scoped or read-only tokens can access operational metrics.
- Metrics can leak traffic patterns, endpoint usage, and deployment behavior.

Recommendation:
- Require admin scope for `/metrics`, or expose metrics only on a separate
  internal listener.

### P2.6 Webhook Configuration Is Accepted Even If It Can Never Deliver

Evidence:
- `SetWebhooks` stores URLs and event names without validation.
- `TriggerWebhooks` later skips unsafe or invalid URLs.
- Unsupported event names simply never match.

Impact:
- Users can save a webhook configuration that silently never fires.

Recommendation:
- Validate URL scheme, host, event names, duplicate hooks, and maximum hook
  count at write time.
- Return explicit validation errors.

### P2.7 Webhook Secret Generation Ignores Randomness Errors

Evidence:
- `internal/store/webhook.go:32` `GenerateWebhookSecret` calls `rand.Read` and
  ignores its error.

Impact:
- Extremely rare, but cryptographic secret generation should never ignore
  entropy failure.

Recommendation:
- Return `(string, error)` and fail webhook setup if randomness fails.

### P2.8 Webhook Signatures Lack Replay Protection

Evidence:
- Webhooks include an HMAC signature of the payload.
- There is no timestamp, nonce, event ID, or replay window.

Impact:
- Anyone who captures a valid webhook can replay it to the receiver unless the
  receiver adds its own protection.

Recommendation:
- Include timestamp and event ID headers.
- Document receiver-side replay checks.
- Optionally include a monotonic delivery ID.

### P2.9 ETag Matching Is Too Loose

Evidence:
- `internal/store/store.go:59` extracts any 64 hex characters from the expected
  header and compares that substring.

Impact:
- This is intentionally proxy-tolerant, but it also accepts malformed strings
  that merely contain a valid hash.
- It does not implement full HTTP `If-Match` list semantics.

Recommendation:
- Preserve proxy tolerance for `W/` and quotes, but parse exact ETag tokens.
- Support comma-separated `If-Match` lists if that is part of the API contract.
- Reject arbitrary malformed wrappers.

### P2.10 Collection and Field Validation Is Inconsistent

Evidence:
- `SearchFTS` validates database names but not collection names.
- `GetWebhooks` validates database names but not collection names.
- Index and FTS field names have no length or character restrictions.

Impact:
- The API boundary is inconsistent.
- Very large field names can create large bbolt bucket keys or metadata.

Recommendation:
- Add `ValidateFieldName` with length and character rules.
- Validate collection names in every public store method.

### P2.11 Observability Is Too Thin for Production Operations

Evidence:
- `cmd/jsonvault/main.go` initializes `slog`, but store/http paths generally do
  not log background worker failures, slow queries, index builds, webhook
  failures, or cache evictions.
- `internal/httpapi/metrics.go` only tracks HTTP request count and duration.

Impact:
- Operators cannot see TTL failures, webhook delivery issues, slow queries,
  bbolt file growth, or eviction pressure.

Recommendation:
- Add structured logs for background errors and slow operations.
- Add Prometheus metrics for active databases, open handles, file sizes, write
  transaction duration, read/query duration, index build duration, TTL deletes,
  webhook queue depth/failures, and subscriber counts.

### P2.12 Delete and Update Paths Leave Empty Index Buckets

Evidence:
- `unindexDocumentTx` deletes the document ID from a value bucket but does not
  remove the value bucket when it becomes empty.

Impact:
- High-cardinality indexed fields can accumulate empty buckets over time.

Recommendation:
- Delete empty value buckets after unindexing.
- Add a maintenance/compact path for existing empty buckets.

### P2.13 Background TTL Worker Bypasses DBHandle Gate for the Transaction

Evidence:
- `purgeExpiredDocuments` copies handles, briefly reads `h.db` under
  `h.gate.RLock`, releases the gate, and then calls `db.Update` directly.

Impact:
- Eviction or database deletion can close a handle between the pointer read and
  the direct update call.
- Failures are currently ignored, making this hard to diagnose.

Recommendation:
- Use `h.Update(...)` or hold the gate for the full transaction.
- Check state before purging.
- Log/metric all purge errors.

### P2.14 Admin and Operational APIs Need Rate Limits

Evidence:
- Expensive endpoints such as index creation, backup, transaction, and webhook
  setup have no per-token or per-IP rate limit.

Impact:
- A compromised or buggy client can repeatedly start expensive operations and
  degrade the database.

Recommendation:
- Add configurable rate limits for admin/structural endpoints.
- Add concurrency limits for backup and index build jobs.

## P3 Findings

### P3.1 Extra Copies After Decryption Increase Allocation Pressure

Evidence:
- `decryptDocument` already allocates a new plaintext slice for encrypted
  documents.
- `GetDocument` and `ListDocuments` copy decrypted document bytes again.

Impact:
- Unnecessary allocation and GC pressure for encrypted reads.

Recommendation:
- Copy only when returning bbolt-owned plaintext slices.
- Make `decryptDocument` return whether the returned slice is owned.

### P3.2 `(*Store)(nil).GetFTSConfig` Is a Maintainability Smell

Evidence:
- `indexFTS` calls `(*Store)(nil).GetFTSConfig(tx, collection)`.

Impact:
- The method works only because `GetFTSConfig` does not use its receiver.
- This makes future changes riskier.

Recommendation:
- Convert it to a package-level helper such as `getFTSConfigTx(tx, collection)`.

### P3.3 Error Responses Hide Useful Internal Context From Logs Too

Evidence:
- `handleStoreError` correctly avoids exposing internals to clients, but there
  is no paired structured internal log for unexpected errors.

Impact:
- Operators see generic `internal server error` responses with little server-side
  context unless the caller can reproduce locally.

Recommendation:
- Log request ID, route, database, collection, operation, and wrapped error for
  internal errors.

### P3.4 Documentation Overstates Some Guarantees

Evidence:
- README describes encryption at rest as a core secure feature, but encryption is
  optional.
- The integration guide describes FTS as high-performance indexed search, but
  current FTS does not backfill and can become stale.
- The integration guide describes publish as JSON, but the handler does not
  validate JSON.

Impact:
- Users can rely on guarantees the implementation does not fully provide.

Recommendation:
- Update docs after fixes, or document current limits clearly until fixes land.

## Recommended Fix Order

1. Fix deadlocks and TTL data loss:
   - schema validation inside write transactions
   - TTL replacement/removal/current-expiry verification
   - TTL unindex/count correctness
   - collection deletion metadata cleanup
2. Fix query correctness:
   - sorted pagination correctness
   - numeric sort semantics
   - FTS backfill/rebuild/stale token cleanup
3. Fix backpressure and ordering:
   - SSE overflow disconnect/resync
   - ordered mutation dispatcher
   - bounded webhook queue with retries/logging
4. Harden security boundaries:
   - admin-only structural endpoints
   - JWT expiration/revocation
   - SSRF-safe dialer
   - encryption-required mode
   - admin-only metrics
5. Improve production operations:
   - structured logs
   - database metrics
   - bounded transaction/index/backup workloads
   - documentation updates

## Minimum Regression Test Plan

Add tests before or alongside fixes:

- `TestPatchWithSchemaDoesNotDeadlock`
- `TestTransactionWithSchemaDoesNotDeadlock`
- `TestTTLUpdateReplacesOldExpiry`
- `TestPutWithoutTTLClearsExistingTTL` or document the opposite and test it
- `TestDeleteDocumentRemovesTTLIndex`
- `TestTTLPurgeRemovesSecondaryAndFTSIndexes`
- `TestDeleteCollectionRemovesSchemaWebhookFTSTTL`
- `TestIndexedFilterSortSortsAllMatchesBeforeLimit`
- `TestNumericSortUsesNumericOrdering`
- `TestSetFTSConfigBackfillsExistingDocuments`
- `TestSetFTSConfigRebuildsWhenFieldsChange`
- `TestPublishRejectsInvalidJSON`
- `TestReadWriteKeyCannotModifySchemaIndexFTSWebhook`
- `TestMetricsRequiresAdmin`
- `TestWebhookRejectsUnsafeURLAtSaveTime`

## Production Gate

Do not treat JSONVault as production-ready for user data until:

- All P0 findings are fixed and covered by tests.
- P1 query correctness, event backpressure, webhook bounding, JWT lifecycle, and
  structural-scope issues are fixed or explicitly accepted as documented
  limitations.
- Backup/index/transaction workloads have limits that protect the single bbolt
  writer.
- Operators have enough logs and metrics to detect silent background failures.
