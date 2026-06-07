# Audit 002 Summary

Date: 2026-06-07
Status: Implemented and verified
Verification: `go test ./...`, `go test -race ./...`, `go vet ./...`

This summary explains what was fixed in Audit 002 in plain language first, then
with enough technical detail for maintainers to understand the important code
changes.

## Short Version

Audit 002 found reliability, data safety, performance, and security problems
that could have affected users in production.

The fixes are now complete for the audit checklist:

- Schema validation no longer risks hanging writes.
- TTL expiry no longer deletes the wrong document or corrupts counts/indexes.
- Deleting a collection now cleans up its owned metadata.
- Sorted queries and indexed pagination are more correct.
- FTS now backfills, rebuilds cleanly, and stores postings more efficiently.
- Index builds no longer expose partial indexes.
- Backup and database-handle eviction are safer under slow clients/readers.
- Webhooks and SSE now have backpressure handling.
- Normal write keys can no longer change schemas, indexes, FTS, webhooks, databases, or collections.
- JWT keys now expire and can be revoked by token ID.
- Webhooks are harder to abuse for SSRF.
- Encryption can be required in fail-closed mode.
- P2/P3 hardening added limits, validation, metrics, logs, docs, and cleanup.

## What This Means For Users

Before these fixes, some edge cases could cause surprising or unsafe behavior:

- A schema-protected write could hang.
- A document with an old TTL could be deleted after it had been updated.
- Deleted collections could leave stale schema, webhook, FTS, or TTL state behind.
- A normal app key had too much power.
- A slow webhook receiver or SSE client could cause silent event problems.

After these fixes, JSONVault is much safer for real users:

- Expiring documents behave predictably.
- Collection deletion is cleaner.
- Real-time clients can detect when they need to reconnect and resync.
- Admin operations are separated from normal document writes.
- Operational endpoints have better limits, metrics, and logs.

## P0 Fixes

### Schema Deadlocks

Plain explanation:
Schema checks used to open a read transaction while already inside a write
transaction. With bbolt, that can hang. The fix makes schema validation use the
already-open transaction when inside a write.

Technical detail:
Added transaction-local schema lookup and no-I/O schema validation helpers.
`PatchDocument` and transaction `put`/`patch` now validate using transaction
schema bytes instead of calling back into store-level read APIs.

### TTL Data Loss And Index Corruption

Plain explanation:
TTL state used to work like a calendar reminder without checking whether that
reminder was still current. An old expiry could delete a newer document.

Technical detail:
TTL now has a current per-document source of truth plus a time-ordered purge
index. Purge verifies the current expiry before deletion, decrypts the old
document, unindexes it, decrements counts only when the document exists, and
publishes delete events only after commit.

### Collection Metadata Cleanup

Plain explanation:
Deleting a collection used to delete the documents but leave some attached
settings behind. Recreating the same collection could inherit old behavior.

Technical detail:
Collection deletion now removes secondary indexes, schema metadata, webhooks,
FTS config and postings, TTL metadata, and collection counts.

## P1 Fixes

### Query And FTS Correctness

Sorted query behavior was fixed so numeric values sort numerically and indexed
filter results are sorted before pagination. Sort keys are decoded once per
document instead of repeatedly inside the comparator.

FTS config now rebuilds/backfills existing documents. FTS postings moved away
from per-token JSON arrays to nested buckets, and search intersects smaller
posting lists more efficiently.

### Index Build Safety

Index creation now uses a build state. Queries cannot use a partially built
index. Writes during a build still update the build bucket, and failed builds
roll back partial state.

### Backup, Eviction, Events, And Webhooks

Backups now snapshot to a temporary local file first, close the bbolt read
transaction, and only then stream to the client. Slow downloads no longer keep
old read transactions alive.

LRU eviction no longer holds the global store mutex while waiting for a database
handle to close.

Mutation events get sequence numbers and are published in commit order. Slow SSE
subscribers are disconnected instead of silently missing events.

Webhook delivery now uses a bounded queue, workers, per-target limits, retries,
status logging, SSRF-safe dialing, and disabled redirects.

### Auth, JWT, SSRF, And Encryption

Structural operations now require admin scope. Normal `read_write` JWTs are for
document CRUD, transactions, and transient publish.

Generated JWTs now include `iat`, `nbf`, `exp`, and `jti`. Keys can be revoked
with `DELETE /api/v1/admin/keys/{jti}`, and the main server persists revoked
token IDs under the data directory.

Webhook SSRF protection now resolves and validates the target, then dials the
validated IP instead of letting the HTTP client resolve a different IP later.

`JSONVAULT_ENCRYPTION_REQUIRED=true` makes startup fail without a valid key and
rejects legacy plaintext documents until they are migrated.

## P2 Fixes

The P2 pass hardened production edges:

- Transactions are limited to 100 operations and 4MB cumulative operation body bytes.
- Schemas are compiled and cached, then invalidated when schemas change.
- Invalid `X-Expire-In` headers now return `400 Bad Request`.
- Publish payloads must be valid JSON.
- `/metrics` requires admin scope.
- Webhook configs are validated on save.
- Webhook secret generation returns entropy errors.
- Webhook replay headers were added: timestamp, event ID, and V2 signature.
- ETag matching is stricter while keeping normal proxy-tolerant forms.
- Field names are validated for indexes, FTS, filters, and sorting.
- Unexpected internal errors are logged server-side.
- Store metrics were added for open handles, data bytes, SSE subscribers, and webhook queue depth.
- Empty secondary-index value buckets are removed after unindexing.
- Admin/operational routes are rate-limited.

## P3 Fixes

The P3 cleanup pass improved maintainability and reduced small inefficiencies:

- Encrypted reads avoid an extra copy when AES-GCM already returned owned plaintext.
- FTS config lookup now uses a transaction helper instead of a nil receiver method.
- Generic HTTP 500 responses now have paired structured internal logs.
- README, integration, server, security, operations, admin, and architecture docs were updated.

## What Still Matters Before Production

The audit checklist is complete, but production rollout should still include
environment-specific validation:

- Restore a backup into a clean data directory.
- Run a load test with realistic document sizes and query patterns.
- Test `JSONVAULT_ENCRYPTION_REQUIRED=true` against your real migration path.
- Tune `JSONVAULT_ADMIN_RATE_LIMIT_PER_MINUTE` for your deployment.
- Confirm metrics and logs are collected by your production monitoring system.

## Files To Review First

- `docs/audit/audit-002-plan.md`: checklist status.
- `docs/audit/audit-002.md`: original findings and audit rationale.
- `docs/integration-guide.md`: client-facing API behavior.
- `docs/server-guide.md`: server configuration and operations.
- `docs/architecture.md`: current architecture model.
