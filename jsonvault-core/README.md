# JSONVault

JSONVault is a high-performance JSON document database implemented in Go. It uses the `bbolt` embedded storage engine, storing each database as a single `.db` file, each collection as a bucket, and each document as a compact JSON value, while exposing a Bearer-token protected REST API.

## Features

- High-performance `bbolt` embedded Key-Value engine for data storage.
- **Secondary Indexing:** Lock-free, nested-bucket O(1) indexes for lightning-fast queries.
- **At-Rest Encryption:** Native AES-GCM application-level value encryption.
- Native ACID transactions and file-level locking with Safe Deletion tracking.
- Fast memory-mapped (mmap) reads with hard Query Limits to prevent OOM exhaustion.
- **Hot Backups:** Stream point-in-time snapshots of your database without downtime.
- **Observability:** Structured `slog` JSON logging and Prometheus metrics (`/metrics`).
- Scoped API-key authentication (RBAC) via `JSONVAULT_API_KEYS`.
- Optimistic Concurrency Control using `ETag` and `If-Match` headers to prevent lost updates.
- JSON-only REST API for database, collection, document, and index CRUD.
- Configurable address, base URL, data directory, request body limit, and server timeouts.

## Run

Create a local `.env` from `.env.example`, set a long random `JSONVAULT_API_KEY`, then start the server:

```powershell
go run ./cmd/jsonvault
```

By default the API listens on `:8080` and stores data in `./data`.

## REST API

All API requests require:

```http
Authorization: Bearer <your-api-key>
Content-Type: application/json
```

Database endpoints:

```http
POST   /api/v1/databases
GET    /api/v1/databases
DELETE /api/v1/{database}
```

`GET /api/v1/databases` returns a JSON array of database names.

Collection endpoints:

```http
POST   /api/v1/{database}/collections
GET    /api/v1/{database}/collections
DELETE /api/v1/{database}/collections/{collection}
```

`GET /api/v1/{database}/collections` returns a JSON array of collection names.

Document endpoints:

```http
POST   /api/v1/{database}/{collection}
GET    /api/v1/{database}/{collection}
GET    /api/v1/{database}/{collection}/{id}
PUT    /api/v1/{database}/{collection}/{id}
DELETE /api/v1/{database}/{collection}/{id}
```

`GET /api/v1/{database}/{collection}` returns a JSON array of documents. Delete operations return JSON confirmation objects.

Example:

```powershell
curl.exe -X POST http://localhost:8080/api/v1/my_app/users `
  -H "Authorization: Bearer change-this-long-random-secret" `
  -H "Content-Type: application/json" `
  -d '{\"name\":\"Alice\",\"active\":true}'
```

For production, run JSONVault behind an HTTPS reverse proxy so API keys and payloads are encrypted in transit.
