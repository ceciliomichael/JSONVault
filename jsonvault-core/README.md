# JSONVault

JSONVault is a lightweight JSON document database implemented in Go. It stores each database as a directory, each collection as a subdirectory, and each document as a compact JSON file, while exposing a Bearer-token protected REST API.

## Features

- File-backed JSON storage with isolated databases, collections, and documents.
- Atomic document writes through temp-file write, sync, and rename
- Per-collection read/write locks for concurrent request safety
- In-memory sharded LRU cache with fixed entry capacity
- Mandatory API-key authentication using `Authorization: Bearer <key>`
- JSON-only REST API for database, collection, and document CRUD
- Configurable address, base URL, data directory, cache size, request body limit, and server timeouts

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
