# JSONVault Operator Guide

This guide is intended for **JSONVault Server Administrators and Operators**. It covers the internal setup, deployment configurations, and operational management of a JSONVault instance. 

*For client-facing API documentation, see [integration-guide.md](integration-guide.md).*

## 1. Environment Configuration (`.env`)

JSONVault requires several environment variables to operate securely. A template is provided in `jsonvault-core/.env.example`.
These are server/operator-facing settings for the person hosting JSONVault.
Application users who connect to your hosted JSONVault instance use the HTTP API
documented in `integration-guide.md`; they do not set these environment
variables.

### Server & Network
```env
# The HTTP address the server listens on.
# If unset, the built-in default is :8080; this template uses :5766.
JSONVAULT_ADDR=:5766


# Maximum request body size (in bytes, default: 10MB)
JSONVAULT_MAX_BODY_BYTES=10485760

# Maximum HTTP header size
JSONVAULT_MAX_HEADER_BYTES=1048576

# Maximum admin/operational requests per bearer token or client IP per minute
JSONVAULT_ADMIN_RATE_LIMIT_PER_MINUTE=120

# Optional local diagnostics; keep disabled unless bound to localhost
# JSONVAULT_PPROF_ADDR=127.0.0.1:6060
```

### Storage & Performance
```env
# Server/operator profile: tiny, default, or large
JSONVAULT_PROFILE=default

# Path to the directory where .db files are stored
JSONVAULT_DATA_DIR=./data

# Maximum number of concurrently open database file descriptors (LRU cache)
JSONVAULT_CACHE_ENTRIES=10

# Store and query resource boundaries
JSONVAULT_MAX_DOCUMENT_BYTES=10485760
JSONVAULT_MAX_RESPONSE_BYTES=33554432
JSONVAULT_MAX_QUERY_SCAN_DOCS=50000
JSONVAULT_MAX_QUERY_SCAN_BYTES=134217728
JSONVAULT_MAX_QUERY_DURATION=15s

# Backup temp location and concurrency
# Defaults to JSONVAULT_DATA_DIR/_tmp/backups when empty
JSONVAULT_BACKUP_TEMP_DIR=
JSONVAULT_BACKUP_CONCURRENCY=1
```

Profiles set safe groups of defaults. They are meant to keep setup simple for
the host while still matching the machine size:

- `tiny`: for small home servers, cheap VPS instances, or devices around
  0.5 vCPU / 1 GB RAM. It lowers request body, document, response, query scan,
  cache, backup concurrency, and timeout budgets so one expensive request is
  less likely to overwhelm the machine.
- `default`: balanced defaults for normal self-hosted or small production
  servers. This is the recommended starting point if the host has more than the
  tiny resource target.
- `large`: higher limits for larger machines. Use it only after testing your
  real document sizes, query shapes, disk, and memory behavior.

Explicit environment variables override profile defaults. For example, you can
use `JSONVAULT_PROFILE=tiny` and still raise `JSONVAULT_MAX_DOCUMENT_BYTES` for
one workload.

Important profile defaults:

| Setting | tiny | default | large |
| --- | ---: | ---: | ---: |
| `JSONVAULT_CACHE_ENTRIES` | 8 | 10 | 128 |
| `JSONVAULT_MAX_BODY_BYTES` | 1 MiB | 10 MiB | 50 MiB |
| `JSONVAULT_MAX_RESPONSE_BYTES` | 8 MiB | 32 MiB | 128 MiB |
| `JSONVAULT_MAX_QUERY_SCAN_DOCS` | 5,000 | 50,000 | 500,000 |
| `JSONVAULT_MAX_QUERY_SCAN_BYTES` | 16 MiB | 128 MiB | 1 GiB |
| `JSONVAULT_MAX_QUERY_DURATION` | 5s | 15s | 60s |
| `JSONVAULT_BACKUP_CONCURRENCY` | 1 | 1 | 2 |

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
JSONVAULT_READ_TIMEOUT=15s
JSONVAULT_READ_HEADER_TIMEOUT=5s
JSONVAULT_WRITE_TIMEOUT=15s
JSONVAULT_IDLE_TIMEOUT=60s
JSONVAULT_SHUTDOWN_TIMEOUT=10s
```

If these variables are omitted, the built-in defaults are 5s read-header, 10s
read, 30s write, 60s idle, and 10s graceful shutdown. The values above match the
included `.env.example` template.

## 2. API Key Provisioning (RBAC)

The `JSONVAULT_ADMIN_KEY` is the root key. Use it only from trusted admin services.
Scoped client keys are JWTs generated with `POST /api/v1/admin/keys` or by a trusted backend that signs tokens with `JSONVAULT_JWT_SECRET`.

When clients make requests, they send `Authorization: Bearer <token>`.

**Available Scopes:**
- `admin`: Has complete control. Can manage databases, collections, schemas, indexes, FTS config, webhooks, keys, and backups.
- `read_write`: Can read, insert, update, patch, delete, transact on documents, and publish transient events within its JWT database/collection constraints. It cannot manage databases, collections, schemas, indexes, FTS config, webhooks, keys, or backups.
- `read_only`: Can only `GET` documents and list databases/collections. Any mutating requests are rejected with `403 Forbidden`.
- `project_admin`: Can manage database-local developer features within its JWT
  database/collection constraints. This is for trusted dashboards, CLIs, or
  backend tools, not browser/mobile runtime code.

Project management tokens use capability claims. Supported capabilities:

- `metadata:read`
- `documents:read`
- `documents:write`
- `indexes:manage`
- `fts:manage`
- `schemas:manage`
- `webhooks:manage`
- `collections:manage`
- `operations:read`
- `operations:cancel`
- `keys:manage`

Use `project_admin` or explicit capabilities when a developer should manage
their own database without receiving the root admin key. Keep normal app clients
on `read_only` or `read_write`.

Keys generated by JSONVault include `iat`, `nbf`, `exp`, and `jti` claims. Revoke a generated key with `DELETE /api/v1/admin/keys/{jti}`.
JSONVault rejects scoped JWTs whose lifetime exceeds the configured generated-key lifetime.

Inspect the current token with:

- `GET /api/v1/me`

This returns the token scope, database/collection constraints, token ID, and
capabilities.

## 3. Admin Feature Provisioning

All endpoints in this section are under `/api/v1`. Mutating operations require
either the root admin key or the listed project-management capability within the
token's database/collection constraints.

### Databases And Collections

JSONVault lazily creates databases and collections on first write, but admin
services can provision or remove them explicitly:

- `GET /databases` lists databases. Scoped read keys can call this within their access rules.
- `POST /databases` with `{"name":"my_database"}` creates a database.
- `DELETE /{database}` deletes a database.
- `GET /{database}/collections` lists collections. Scoped read keys can call this within their access rules.
- `POST /{database}/collections` with `{"name":"users"}` creates a collection. Requires `collections:manage`.
- `DELETE /{database}/collections/{collection}` deletes a collection. Requires `collections:manage`.

Because list routes do not always include both database and collection path
parameters, narrow JWTs may not be able to call them. `GET /databases` needs an
admin key or a scoped token with `database: "*"`. `GET /{database}/collections`
needs access to that database and usually `collection: "*"`.

### Schemas

Schemas are Draft-07 JSON Schema documents attached to collections:

- `GET /{database}/{collection}/schema` returns the active schema, or `{"schema": null}`. Scoped read keys can call this.
- `POST /{database}/{collection}/schema/validate` validates a schema without storing it. Requires `schemas:manage`.
- `PUT /{database}/{collection}/schema` stores or replaces the schema. Requires `schemas:manage`. The collection must already exist.
- `DELETE /{database}/{collection}/schema` removes the schema. Requires `schemas:manage`.

After a schema is attached, invalid `POST`, `PUT`, or `PATCH` document writes
fail with `400 Bad Request` and error code `schema_validation_failed`.

### Secondary Indexes

Secondary indexes speed up exact-match `filter[<field>]` queries:

- `GET /{database}/{collection}/indexes` lists configured indexes. Scoped read keys can call this.
- `GET /{database}/{collection}/indexes?details=true` returns structured index metadata.
- `POST /{database}/{collection}/indexes` with `{"field":"email"}` creates an index. Requires `indexes:manage`.
- `POST /{database}/{collection}/indexes?async=true` starts an async index build and returns an `operation_id`.
- `DELETE /{database}/{collection}/indexes/{field}` deletes an index. Requires `indexes:manage`.

Index builds backfill existing documents and are promoted only after the build
is complete, so queries do not use partially built indexes.

### Full-Text Search

Full-text search indexes are configured per collection:

- `GET /{database}/{collection}/fts` returns configured FTS fields and state.
- `POST /{database}/{collection}/fts` with `{"fields":["title","body"]}` sets the indexed fields. Requires `fts:manage`.
- `POST /{database}/{collection}/fts?async=true` starts an async FTS rebuild and returns an `operation_id`.

Changing FTS fields rebuilds the collection FTS index from existing documents in
batches. Application clients query FTS with `search=<terms>` on the normal list
documents endpoint.

### Webhooks

Webhooks are configured per collection:

- `PUT /{database}/{collection}/webhooks` sets webhook targets and returns `webhook_secret`. Requires `webhooks:manage`.
- `GET /{database}/{collection}/webhooks` lists webhook targets. Requires `webhooks:manage`. It does not return the secret.
- `GET /admin/webhooks/{database}/deliveries?status=failed&limit=100` inspects durable delivery records. Requires admin or database-level `webhooks:manage`.
- `POST /admin/webhooks/{database}/deliveries/{sequence}/retry` schedules a delivery for retry. Requires admin or database-level `webhooks:manage`.

Keep `webhook_secret` private. JSONVault returns it only when webhooks are set,
then uses it to sign delivery payloads.

### Operations And Audit

Developer management actions are tracked in memory for status and review:

- `GET /operations/{operation_id}` returns one operation.
- `GET /operations` lists operations visible to the current token.
- `POST /operations/{operation_id}/cancel` requests cancellation when supported.
- `GET /audit` lists management audit records visible to the current token.

Use `?async=true` on index and FTS management endpoints when dashboards or CLIs
need non-blocking behavior.

## 4. Storage Architecture & Secondary Indexes

JSONVault uses `bbolt` internally. 
- **Database Separation**: Each database is isolated into its own file (e.g., `ecommerce.db`), allowing granular backups and preventing cross-tenant leakage.
- **File Descriptors**: To prevent hitting OS open-file limits under high scale, database file handles are pooled and managed via an LRU cache (configured via `JSONVAULT_CACHE_ENTRIES`). 
- **Secondary Indexing**: To prevent `O(N)` scans when using URL filters (e.g., `?filter[active]=true`), administrators can provision secondary indices via `POST /api/v1/{database}/{collection}/indexes`. Index builds use an internal build state and are promoted only after backfill completes, so queries do not use partially built indexes.
- **Query Budgets**: List queries are bounded by scanned documents, scanned bytes, response bytes, and query duration. When a query exceeds the budget, JSONVault returns a clear `query_limit_exceeded` error instead of risking process memory.
- **FTS Backfill**: FTS configuration backfills existing documents in batches instead of one large write transaction.

## 5. Observability & Metrics

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

### Query Diagnostics For Operators

Application developers normally only need the document response and pagination
headers. Operators can use diagnostics when helping users tune slow queries.

Add `explain=true` to a list request to return query stats instead of the
document array:

```http
GET /api/v1/{database}/{collection}?filter[status]=%22active%22&explain=true
```

Diagnostic headers on normal list responses:

- `X-JSONVault-Scanned-Documents`
- `X-JSONVault-Scanned-Bytes`
- `X-JSONVault-Returned-Bytes`
- `X-JSONVault-Index-Used`
- `X-JSONVault-Sort-Mode`
- `X-JSONVault-FTS-Candidates`
- `X-JSONVault-Warning: unindexed_filter`
- `X-JSONVault-Sort-Warning: in_memory_sort`
- `X-JSONVault-Pagination-Warning: offset_pagination`

Use these to decide whether to add an index, reduce server limits, or ask a
client app to use smaller pages or more selective filters.

### Helping Users With `query_limit_exceeded`

`query_limit_exceeded` is intentional admission control. JSONVault returns it
when a list query crosses the configured scan, response, candidate, or duration
budget instead of risking server memory or CPU pressure.

Common causes and operator actions:

| User symptom | Likely cause | Operator action |
| --- | --- | --- |
| Filtered list fails on a large collection | Filter field is not indexed, or filter value matches too many documents | Check `X-JSONVault-Warning: unindexed_filter` or `explain=true`; add an index for selective fields |
| List fails even with a small `limit` | Documents are large or query must scan many non-matching documents | Add/select a better index, ask the app to use a narrower filter, or review `JSONVAULT_MAX_QUERY_SCAN_*` |
| List fails with high `limit` | Response byte budget is exceeded | Ask the app to lower `limit`, reduce list-view document size, or review `JSONVAULT_MAX_RESPONSE_BYTES` |
| Search fails or returns too slowly | FTS term matches too many candidates | Ask for more specific search terms, review indexed FTS fields, and check `X-JSONVault-FTS-Candidates` |
| Sorted query fails or is slow | Broad in-memory sort | Ask the app to narrow filters first; index-backed sorting remains follow-up work |
| Deep pages fail | Offset pagination forces the server to walk many matches | Ask the app to avoid deep offsets or use narrower filters/time windows |

Do not raise budgets blindly. Higher budgets can help one app but increase
latency, memory use, and noisy-neighbor risk for other users. Prefer indexes,
more selective queries, smaller pages, and measured hardware/profile changes.

## 6. Administrative Backup

Only keys with the `admin` scope can trigger raw database backups.
- **Request**: `GET /api/v1/admin/backup/{database}`
- **Response**: Streams the raw `.db` file down as `application/octet-stream`. JSONVault first snapshots the database to a temporary local file, closes the bbolt read transaction, and then streams the snapshot to the client so slow downloads do not hold long-lived read transactions.
- **Temp Directory**: Backup snapshots use `JSONVAULT_BACKUP_TEMP_DIR`, defaulting to `JSONVAULT_DATA_DIR/_tmp/backups`.
- **Space Check**: JSONVault checks available space before snapshotting and rejects the backup if the temp directory cannot hold the snapshot plus margin.
- **Concurrency**: Backups are concurrency-limited by `JSONVAULT_BACKUP_CONCURRENCY`.
