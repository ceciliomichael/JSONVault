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
# A strict 64-character hex string used for AES-GCM database encryption
JSONVAULT_ENCRYPTION_KEY=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

# Provisioned API Keys. Multiple keys are separated by commas.
# Scopes are assigned here using the :scope suffix.
JSONVAULT_API_KEYS=admin_secret:admin,readonly_secret:read_only,webapp_secret:read_write
```

### Timeouts
```env
JSONVAULT_READ_HEADER_TIMEOUT=2s
JSONVAULT_READ_TIMEOUT=5s
JSONVAULT_WRITE_TIMEOUT=10s
JSONVAULT_IDLE_TIMEOUT=120s
JSONVAULT_SHUTDOWN_TIMEOUT=5s
```

## 2. API Key Provisioning (RBAC)

API keys are mapped to specific **Scopes** using the `JSONVAULT_API_KEYS` variable. 
Format: `<raw_secret>:<scope>,<raw_secret2>:<scope2>`

When clients make requests, they **must not** include the scope. They should only send `Authorization: Bearer <raw_secret>`. The server automatically determines the scope during the SHA-256 hash comparison.

**Available Scopes:**
- `admin`: Has complete control. Can read/write all collections, create indices, and `DELETE` entire databases.
- `read_write`: Can read, insert, update, and delete documents and collections. **Cannot** delete or create full databases, and **cannot** perform database backups.
- `read_only`: Can only `GET` documents and list databases/collections. Any mutating requests are rejected with `403 Forbidden`.
- *(Unspecified)*: If an API key is provisioned without a colon (e.g., `secret`), it defaults to `admin`.

## 3. Storage Architecture & Secondary Indexes

JSONVault uses `bbolt` internally. 
- **Database Separation**: Each database is isolated into its own file (e.g., `ecommerce.db`), allowing granular backups and preventing cross-tenant leakage.
- **File Descriptors**: To prevent hitting OS open-file limits under high scale, database file handles are pooled and managed via an LRU cache (configured via `JSONVAULT_CACHE_ENTRIES`). 
- **Secondary Indexing**: To prevent `O(N)` scans when using URL filters (e.g., `?filter[active]=true`), administrators can provision secondary indices via `POST /api/v1/{database}/{collection}/indexes`. The server will map these into heavily nested buckets `_idx_<collection>_<field> -> <typed_value> -> <doc_id>` for `O(1)` point-lookups.

## 4. Observability & Metrics

JSONVault natively exports Prometheus metrics on the standard `/metrics` endpoint. 

- **Endpoint**: `GET /metrics`
- **Tracked Metrics**:
  - `http_requests_total`: Tracks the total number of HTTP requests processed, labeled by `method`, `path`, and `status`.
  - `http_request_duration_seconds`: Histogram measuring response latency, labeled by `method` and `path`.

## 5. Administrative Backup

Only keys with the `admin` scope can trigger raw database backups.
- **Request**: `GET /api/v1/admin/backup/{database}`
- **Response**: Streams the raw `.db` file down as `application/octet-stream`. This uses a safe, read-only transaction on the bbolt engine to ensure the backup is not corrupted by active writes.
