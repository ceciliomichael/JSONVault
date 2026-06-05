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
- **Mmap**: The entire database is mapped into memory using `mmap`. This makes read queries and full collection scans incredibly fast without loading the entire database into the Go heap.

## Open Handle LRU Cache
Since `bbolt` requires holding a file lock, JSONVault keeps database file descriptors open to avoid the overhead of reopening the database for every request.
To prevent leaking memory and file descriptors, JSONVault implements a thread-safe LRU cache inside `Store`.
The cache ensures no more than `JSONVAULT_CACHE_ENTRIES` (default 10) databases are open at once. Inactive databases are cleanly closed and evicted.

## Safe Deletion
To prevent a Database from being deleted (`os.Remove`) while queries are in progress, JSONVault wraps each database connection in a `DBHandle` struct.
This struct uses a `sync.WaitGroup` to track active transactions. When a delete request is received, the `DBHandle` state switches to `deleting`, blocking new queries and waiting for the WaitGroup to drop to 0 before safely deleting the file.
