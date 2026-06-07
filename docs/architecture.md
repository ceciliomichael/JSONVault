# JSONVault Architecture

JSONVault is designed as a high-performance, embedded JSON document store. It prioritizes data integrity, concurrent read performance, and simplicity.

## Storage Engine: bbolt
Instead of writing one JSON file per document (which causes severe filesystem locking issues and inode exhaustion), JSONVault uses `go.etcd.io/bbolt`.
- **bbolt** is an embedded Key-Value store using a B+Tree.
- It operates on a single `.db` file per Database.
- Collections map to `bbolt` Buckets.
- Documents are stored as Key-Value pairs, where the Key is a 16-byte random hex `id`, and the Value is the JSON payload.

## Concurrency Model
JSONVault allows high concurrency with ACID guarantees:
- **Readers do not block writers**: `bbolt` uses MVCC (Multi-Version Concurrency Control). A read transaction sees a consistent point-in-time snapshot of the database.
- **Writers block writers**: Only one write transaction is allowed at a time per Database (`.db` file).
- **Mutation ordering**: JSONVault serializes document mutations through a store-level write mutex so commit events, TTL cleanup, indexes, and structural metadata stay ordered consistently.
- **Mmap**: The entire database is mapped into memory using `mmap`. This makes read queries and full collection scans incredibly fast without loading the entire database into the Go heap.

## Open Handle LRU Cache
Since `bbolt` requires holding a file lock, JSONVault keeps database file descriptors open to avoid the overhead of reopening the database for every request.
To prevent leaking memory and file descriptors, JSONVault implements a thread-safe LRU cache inside `Store`.
The cache ensures no more than `JSONVAULT_CACHE_ENTRIES` databases are open at once. Eviction removes the old handle from the map before waiting for its gate, so one slow database does not freeze unrelated database opens.

## Safe Deletion
To prevent a Database from being deleted (`os.Remove`) while queries are in progress, JSONVault wraps each database connection in a `DBHandle` struct.
This struct uses a state flag plus a gate lock around full read/write transactions. When a delete request is received, the handle switches to `deleting`, new transactions are rejected, and close/delete waits for active transactions to release the gate.

## Indexes And Query Paths
Secondary indexes are stored as nested buckets:
`_idx_<collection>_<field> -> <typed_value> -> <doc_id>`.

Index creation uses a build marker and batched backfill. Queries only see an index after it is promoted into completed metadata, while concurrent document writes update any active build bucket. If a build fails or is canceled, the partial bucket is removed.

Full-text search uses token posting buckets rather than rewriting JSON arrays for common terms. Reverse mappings let updates, deletes, TTL expiry, and collection deletion remove stale FTS entries.

## TTL And Metadata Ownership
TTL uses two pieces of metadata:
- A document-owned source of truth that records the current expiry for `collection/id`.
- A time-ordered purge index used by the background worker.

Purge verifies the current document TTL before deleting anything. Collection deletion removes all collection-owned schema, webhook, FTS, TTL, count, and index metadata so recreated collections do not inherit stale state.

## Events, SSE, And Webhooks
Every mutation event gets a monotonic sequence number after commit. Slow SSE subscribers are disconnected on overflow so clients know to reconnect and resync instead of silently missing events.

Webhook delivery uses a bounded queue, worker pool, per-target limits, SSRF-safe dialing, disabled redirects, retry logging, HMAC signatures, timestamps, and event IDs.

## Security Boundaries
The admin key controls structural operations: databases, collections, schemas, indexes, FTS config, webhooks, backups, metrics, and key lifecycle.
Scoped JWTs are intended for document access. Generated JWTs include `iat`, `nbf`, `exp`, and `jti`; revoked IDs are persisted under the data directory by the main server.

## Backup Model
Backups snapshot the bbolt file to a temporary local file first. The read transaction closes before JSONVault streams the snapshot to the HTTP client, so slow downloads do not keep old bbolt read transactions open.
