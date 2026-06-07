# JSONVault Server Configuration Guide

This guide is intended for **JSONVault Server Administrators and Operators**. It covers the internal setup, deployment configurations, and operational management of a JSONVault instance. 

*For client-facing API documentation, see [integration-guide.md](integration-guide.md).*

## 1. Environment Configuration (`.env`)

JSONVault requires several environment variables to operate securely. A template is provided in `jsonvault-core/.env.example`.

### Server & Network
```env
# The HTTP port the server listens on
JSONVAULT_ADDR=:5766


# Maximum request body size (in bytes, default: 10MB)
JSONVAULT_MAX_BODY_BYTES=10485760

# Maximum admin/operational requests per bearer token or client IP per minute
JSONVAULT_ADMIN_RATE_LIMIT_PER_MINUTE=120
```

### Storage & Performance
```env
# Path to the directory where .db files are stored
JSONVAULT_DATA_DIR=./data

# Maximum number of concurrently open database file descriptors (LRU cache)
JSONVAULT_CACHE_ENTRIES=8
```

### Security & Authentication
```env
# Root server key used for administrative operations
JSONVAULT_ADMIN_KEY=replace-with-a-long-random-secret

# HMAC secret used to sign scoped JWT API keys
JSONVAULT_JWT_SECRET=replace-with-a-different-long-random-secret

# A strict 64-character hex string used for AES-GCM database encryption
JSONVAULT_ENCRYPTION_KEY=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

# Fail startup if encryption is required but JSONVAULT_ENCRYPTION_KEY is missing or invalid.
# In this mode, legacy plaintext documents are rejected until migrated.
JSONVAULT_ENCRYPTION_REQUIRED=true
```

### Encryption Modes

Use these examples to decide how to configure encryption:

```env
# Mode 1: No encryption. Useful only for local development.
# New documents are stored as plaintext.
JSONVAULT_ENCRYPTION_KEY=
JSONVAULT_ENCRYPTION_REQUIRED=false
```

```env
# Mode 2: Encryption enabled, migration-compatible.
# New and updated documents are encrypted, but old plaintext documents can still be read.
# This is useful while migrating an existing plaintext database.
JSONVAULT_ENCRYPTION_KEY=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
JSONVAULT_ENCRYPTION_REQUIRED=false
```

```env
# Mode 3: Encryption required, production fail-closed mode.
# Server startup fails if the key is missing/invalid.
# Old plaintext documents are rejected until migrated.
JSONVAULT_ENCRYPTION_KEY=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
JSONVAULT_ENCRYPTION_REQUIRED=true
```

`JSONVAULT_ENCRYPTION_KEY` controls whether JSONVault can encrypt documents.
`JSONVAULT_ENCRYPTION_REQUIRED=true` controls whether JSONVault is allowed to run
or read legacy plaintext when encryption is not fully enforced.

Legacy plaintext means old documents that were saved before encryption was
enabled. They are still stored as raw JSON in the `.db` file until they are
rewritten with a valid encryption key. In required mode, JSONVault rejects those
old plaintext documents instead of silently reading unencrypted data.

Disabling `JSONVAULT_ENCRYPTION_REQUIRED` is not the same as disabling
encryption. If `JSONVAULT_ENCRYPTION_KEY` is still configured, new and rewritten
documents are still encrypted. If you remove `JSONVAULT_ENCRYPTION_KEY`, then
new and rewritten documents are stored as plaintext, and existing encrypted
documents cannot be read until the key is configured again.

### Example Encryption Migration Flow

1. JSONVault starts with no encryption key.
   ```env
   JSONVAULT_ENCRYPTION_KEY=
   JSONVAULT_ENCRYPTION_REQUIRED=false
   ```
   A user writes `{"name":"Alice"}`. The document is stored as raw JSON. This is
   now a legacy plaintext document.

   Conceptually, storage looks like:
   ```text
   document id: user-1
   stored value: {"name":"Alice"}
   ```

2. You add an encryption key, but keep required mode off.
   ```env
   JSONVAULT_ENCRYPTION_KEY=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
   JSONVAULT_ENCRYPTION_REQUIRED=false
   ```
   New writes are encrypted. Old plaintext documents can still be read so the
   app does not break during migration.

   A new document written now is stored as encrypted bytes, not readable JSON:
   ```text
   document id: user-2
   stored value: 00 8f 21 a4 ... encrypted AES-GCM bytes ...
   ```

3. You migrate old documents by reading and rewriting them.
   For each old document, read it once and write it back with `PUT`. The rewritten
   version is saved encrypted because the encryption key is now configured.

   After rewriting `user-1`, storage changes from raw JSON to encrypted bytes:
   ```text
   before: {"name":"Alice"}
   after:  00 b7 91 c2 ... encrypted AES-GCM bytes ...
   ```

4. After all old documents are rewritten, enable required mode.
   ```env
   JSONVAULT_ENCRYPTION_KEY=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
   JSONVAULT_ENCRYPTION_REQUIRED=true
   ```
   Now JSONVault fails startup if the key is missing and rejects any remaining
   plaintext document. This is the production fail-closed setting.

### Timeouts
```env
JSONVAULT_READ_HEADER_TIMEOUT=2s
JSONVAULT_READ_TIMEOUT=5s
JSONVAULT_WRITE_TIMEOUT=10s
JSONVAULT_IDLE_TIMEOUT=120s
JSONVAULT_SHUTDOWN_TIMEOUT=5s
```

## 2. API Key Provisioning (RBAC)

The `JSONVAULT_ADMIN_KEY` is the root key. Use it only from trusted admin services.
Scoped client keys are JWTs generated with `POST /api/v1/admin/keys` or by a trusted backend that signs tokens with `JSONVAULT_JWT_SECRET`.

When clients make requests, they send `Authorization: Bearer <token>`.

**Available Scopes:**
- `admin`: Has complete control. Can manage databases, collections, schemas, indexes, FTS config, webhooks, keys, and backups.
- `read_write`: Can read, insert, update, patch, delete, transact on documents, and publish transient events within its JWT database/collection constraints. It cannot manage databases, collections, schemas, indexes, FTS config, webhooks, keys, or backups.
- `read_only`: Can only `GET` documents and list databases/collections. Any mutating requests are rejected with `403 Forbidden`.

Keys generated by JSONVault include `iat`, `nbf`, `exp`, and `jti` claims. Revoke a generated key with `DELETE /api/v1/admin/keys/{jti}`.

## 3. Storage Architecture & Secondary Indexes

JSONVault uses `bbolt` internally. 
- **Database Separation**: Each database is isolated into its own file (e.g., `ecommerce.db`), allowing granular backups and preventing cross-tenant leakage.
- **File Descriptors**: To prevent hitting OS open-file limits under high scale, database file handles are pooled and managed via an LRU cache (configured via `JSONVAULT_CACHE_ENTRIES`). 
- **Secondary Indexing**: To prevent `O(N)` scans when using URL filters (e.g., `?filter[active]=true`), administrators can provision secondary indices via `POST /api/v1/{database}/{collection}/indexes`. Index builds use an internal build state and are promoted only after backfill completes, so queries do not use partially built indexes.

## 4. Observability & Metrics

JSONVault natively exports Prometheus metrics on the standard `/metrics` endpoint. 

- **Endpoint**: `GET /metrics`
- **Authorization**: Admin key required.
- **Tracked Metrics**:
  - `jsonvault_http_requests_total`: Tracks the total number of HTTP requests processed, labeled by `method`, `path`, and `status`.
  - `jsonvault_http_request_duration_seconds`: Histogram measuring response latency, labeled by `method` and `path`.
  - `jsonvault_store_open_databases`: Number of open database handles.
  - `jsonvault_store_data_bytes`: Total bytes used by `.db` files under `JSONVAULT_DATA_DIR`.
  - `jsonvault_sse_subscribers`: Active SSE subscriber count.
  - `jsonvault_webhook_queue_depth`: Current webhook queue depth.

## 5. Administrative Backup

Only keys with the `admin` scope can trigger raw database backups.
- **Request**: `GET /api/v1/admin/backup/{database}`
- **Response**: Streams the raw `.db` file down as `application/octet-stream`. JSONVault first snapshots the database to a temporary local file, closes the bbolt read transaction, and then streams the snapshot to the client so slow downloads do not hold long-lived read transactions.
