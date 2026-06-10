# JSONVault Client Integration Guide

Welcome to JSONVault! This guide is written for frontend and backend developers who need to connect their applications to a JSONVault database. 

JSONVault is a NoSQL document database built for speed and developer experience. It operates over a simple REST API and features built-in Real-Time Subscriptions.

Data is organized into a strict hierarchy: **Database -> Collection -> Document**.

This guide is for people building apps against a JSONVault instance that is
already hosted. You control:

- the API key/JWT you send;
- document request bodies;
- query parameters such as `limit`, `offset`, `filter`, `sort`, and `search`;
- ETag headers for safe updates;
- SSE reconnect behavior such as `Last-Event-ID`.

You do not configure server environment variables from this guide. Server
profiles, disk paths, backup settings, encryption mode, and resource limits are
managed by the JSONVault host/operator.

Admin-only setup actions are called out as host-managed. If you are using a
hosted JSONVault instance with a normal `read_write` key, you use the runtime
API here and ask the host/operator to change schemas, indexes, FTS settings,
webhooks, keys, backups, or server limits.

If your host gives you a project management token, it may include capabilities
such as `indexes:manage`, `fts:manage`, `schemas:manage`, or `webhooks:manage`
for your own database. Keep that token in trusted backend/dashboard/CLI code,
not in browser or mobile runtime code.

---

## 💡 1. Core Principles (The "Quirks")

Before diving into the API, you must understand these three core features of JSONVault. Knowing these will save you hours of debugging!

### 🧩 1. Lazy Auto-Creation
You **never** need to explicitly create a database or a collection. 
When you insert your first document into `my_app_db/users`, JSONVault automatically provisions the database and collection in milliseconds.
* **The Quirk:** Because of this, if you query a collection that hasn't been created yet (e.g. `GET /users` on a fresh install), JSONVault will gracefully return an empty array `[]`. It will **not** throw a 404 error, keeping your frontend code incredibly simple!

### 🔄 2. Built for Real-Time (SSE)
Instead of hammering the server with continuous polling, JSONVault has an internal event bus. You can open a Server-Sent Events (SSE) connection to any collection, and the database will instantly stream all inserts, updates, and deletes directly to your app.
* **The Quirk:** You can subscribe to a collection *before it even exists*. The server will hold the connection open gracefully until the first document is inserted. 

### 🛡️ 3. Optimistic Concurrency (ETags)
To prevent two users from accidentally overwriting each other's edits, JSONVault uses cryptographic **ETags**. 
When you read a document, you get an `ETag`. When you update that document, you send the `ETag` back in the `If-Match` HTTP header. If someone else changed the document in the meantime, your update is safely rejected with a `412 Precondition Failed`.
* **The Quirk:** JSONVault is incredibly forgiving. Even if your proxy (like Cloudflare or Next.js) aggressively mutates your ETag by adding `W/` or stripping quotes, JSONVault will automatically extract the underlying cryptographic hash and match it perfectly.

---

## 🔐 2. Authentication & API Keys

JSONVault uses **scoped JSON Web Tokens (JWTs)** for access.

You should receive an API Key (JWT) from your Dashboard Provider.

### Accessing the Database
Every HTTP request (except `/healthz`) MUST include the generated token in the header:

```http
Authorization: Bearer <your-generated-jwt-token>
Content-Type: application/json
```
*(Note: `Content-Type` is strictly required for POST, PUT, and PATCH requests).*

If you receive a `403 Forbidden` error or a `401 Unauthorized` error, your JWT Token does not have the required permissions for that specific database/collection.

Normal `read_write` keys are limited to document CRUD, transactions, and
transient publish within their JWT database/collection constraints. Schema,
index, FTS, webhook, collection, and key management require explicit project
management capabilities or an admin key. Backup and server setting management
remain host/operator responsibilities.

Use `GET /api/v1/me` to inspect your token's scope, database/collection
constraints, token ID, and capabilities.

---

## 📡 3. The API Reference

### Base URL
All endpoints documented below are relative to your project's unique Base URL. 
You can find this URL in the **Connect** panel of your JSONVault Dashboard.

**Format:** `https://your-host.com/api/v1/[project-id]`

*(Example: `GET /collections` corresponds to `GET https://your-host.com/api/v1/[project-id]/collections`)*

---

### Real-Time Subscriptions

#### Stream Collection Updates
Open a persistent HTTP connection to receive live document mutations.
- **Request:** `GET /{collection}/subscribe`
- **Response:** Infinite stream of `text/event-stream`
- **Event Format:**
  ```text
  data: {"sequence":1,"action":"insert","database":"{db}","collection":"{coll}","document_id":"<id>","etag":"<new_etag>","document":{...}}
  id: 1
  
  data: {"sequence":2,"action":"update","database":"{db}","collection":"{coll}","document_id":"<id>","etag":"<new_etag>","document":{...}}
  id: 2
  
  data: {"sequence":3,"action":"delete","database":"{db}","collection":"{coll}","document_id":"<id>"}
  id: 3
  ```

> [!WARNING]
> **The Delete Quirk:** Notice that the `delete` action payload completely omits the `document` object. When parsing SSE events, always rely on `event.document_id` to identify the document that was deleted, otherwise your application will crash trying to read `event.document.id`.
Use the standard `Last-Event-ID` header, or `?last_event_id=<sequence>`, to replay retained committed document events after reconnecting. Transient `publish` messages are not stored and cannot be replayed.

*(Note: To prevent proxies from dropping idle connections, JSONVault sends a silent `: keepalive` comment every 15 seconds. Standard EventSource clients handle this automatically. If a subscriber falls behind, JSONVault closes the stream; clients should reconnect with the last event ID.)*

#### Publish Transient Message (Pub/Sub)
Instantly broadcast a JSON message to all active SSE subscribers without saving it to the database disk. Perfect for ephemeral events like "User is typing...".
- **Request:** `POST /{collection}/publish`
- **Body:** Any valid JSON object (Max 100KB).
- **Response (202 Accepted):** `{"published": true, "database": "...", "collection": "..."}`

#### Real-Time Presence
Get the exact number of active SSE connections currently subscribed to a collection. Perfect for showing "Online Users".
- **Request:** `GET /{collection}/presence`
- **Response (200 OK):** `{"database": "my_app", "collection": "users", "subscribers": 42}`

---

### Documents (CRUD)

#### List Documents
Retrieve a paginated list of documents, optionally filtered and sorted directly in the query string.
- **Request:** `GET /{collection}`
  - **Query Parameters:**
    - `limit` (max: 1000, default: 100)
    - `offset` (max: 10000, default: 0)
    - `sort` (e.g., `?sort=age` for ascending, or `?sort=-created_at` for descending)
    - `search` (full-text search query, only useful when the host has enabled FTS for the collection)
    - `filter[<field>]` (e.g., `?filter[status]=%22active%22&filter[age]=30`)
      *Note: Filter values must be valid JSON strings (e.g. `%22string%22` for strings, `true` for booleans, `42` for numbers).*
- **Response (200 OK):** An array of documents. (Pagination metadata is returned in `X-Total-Count`, `X-Limit`, `X-Offset` headers).

If a query exceeds configured scan, response, or time budgets, JSONVault returns
`query_limit_exceeded`. Lower the page size, use a more selective filter, or
ask the JSONVault host to add an index or adjust server limits.

These budgets are configured by the JSONVault host/operator. As an application
developer using a hosted JSONVault instance, you do not set the server
environment variables yourself.

#### When `query_limit_exceeded` Happens

This error means JSONVault stopped the query on purpose before it could consume
too much CPU, memory, response size, or time on the server.

You might run into it when:

- the collection is large and your filter is not backed by an index;
- the filter is too broad, such as `status="active"` when most documents are active;
- the page is too large or each document is large, causing the response byte
  budget to be exceeded;
- the query uses a deep `offset`, so the server must walk many matching
  documents before returning your page;
- the query sorts a broad result set in memory;
- the `search` term is too broad and matches too many FTS candidates.

What you can do in app code:

- lower `limit`;
- add a more selective filter;
- avoid deep offset pagination for large collections;
- use more specific search terms;
- avoid returning very large documents in list views when possible.

Why you may need the host/operator: app developers with normal scoped keys
cannot create indexes, change FTS indexed fields, raise server resource budgets,
or resize the machine. Those changes affect server reliability for every user,
so they belong to the JSONVault host/operator.

Example error:

```json
{
  "error": {
    "code": "query_limit_exceeded",
    "message": "query exceeds configured resource limit: scanned documents exceeded 50000"
  }
}
```

#### Create Document
- **Request:** `POST /{collection}`
- **Headers:** `X-Expire-In: <seconds>` (Optional: Automatically delete document after X seconds)
- **Body:** Any valid JSON object.
- **Response (201 Created):** Returns the auto-generated `id` and the generated `ETag` header.
*(Note: `X-Expire-In` must be a positive integer number of seconds no greater than 31536000.)*

#### Get Document by ID
- **Request:** `GET /{collection}/{id}`
- **Response (200 OK):** Returns the document and its `ETag` header.

#### Update or Create Document (Upsert)
Completely overwrites the document if it exists, or creates a new document using the `{id}` you provide.
- **Request:** `PUT /{collection}/{id}`
- **Headers:** 
  - `If-Match: <your-etag>` (Optional, but highly recommended if updating)
  - `X-Expire-In: <seconds>` (Optional: Automatically delete document after X seconds)
- **Body:** The full new JSON object.
- **Response (200 OK):** Returns the upserted document and its `ETag` header.
*(Note: `PUT` without `X-Expire-In` clears an existing TTL for that document. `PATCH` preserves the existing TTL.)*

#### Partial Update Document (Merge)
Updates specific fields while preserving the rest (e.g. only updating `status: "completed"`).
- **Request:** `PATCH /{collection}/{id}`
- **Headers:** `If-Match: <your-etag>` (Optional, but highly recommended)
- **Body:** A JSON object containing only the fields to modify.

#### Delete Document
- **Request:** `DELETE /{collection}/{id}`
- **Headers:** `If-Match: <your-etag>` (Optional)

---

### Schemas & Validation (Host-Managed)

JSONVault is schemaless by default. A host/operator can attach a Draft-07 JSON
Schema to a collection to enforce document shape.

As an application developer:

- **Inspect active schema:** `GET /{collection}/schema`
- **No schema response:** `{"schema": null}`
- **Validation failure:** `400 Bad Request` with error code `schema_validation_failed`

Schema creation and removal require `schemas:manage` or an admin key. If a write
starts failing because of validation, compare your payload with the active
schema or ask the host/operator/project owner to update the collection schema.

---

### Secondary Indexes (Host-Managed)

Filters work whether or not an index exists. Without an index, JSONVault may
need to scan documents until the query matches, reaches the page limit, or hits
a host-configured query budget.

As an application developer:

- Use `filter[<field>]` normally.
- Inspect configured indexes with `GET /{collection}/indexes`.
- If a query returns `query_limit_exceeded`, reduce the page size, use a more
  selective filter, or ask the host/operator to add an index.

Creating and deleting indexes require `indexes:manage` or an admin key. Index
builds backfill existing documents and are promoted only when ready, so normal
queries do not use partially built indexes.

---

### Full-Text Search (FTS)

JSONVault includes a native inverted index engine for searching configured text
fields. The host/operator chooses which fields are indexed for each collection.

#### Querying

You can use the `search` query parameter to instantly intersect tokens and find matching documents. 
For multiple words, standard URL encoding applies (e.g. `fast+car`).

```bash
# Find any users where "john" is mentioned in their name or bio
curl "https://your-host.com/api/v1/[project-id]/users?search=john" \
  -H "Authorization: Bearer <your_jwt_token>"

# Combine Full-Text Search with B-Tree filters
curl "https://your-host.com/api/v1/[project-id]/users?search=engineer&filter[status]=%22active%22" \
  -H "Authorization: Bearer <your_jwt_token>"
```

If FTS is not configured for the collection, `search` returns no matches.
Changing the FTS field list requires `fts:manage` or an admin key.

---

### Atomic Transactions

JSONVault supports ACID-compliant atomic transactions, allowing you to update multiple documents at exactly the same time. If any single operation fails (e.g. invalid JSON, missing ETag), the entire transaction rolls back.

- **Request:** `POST /transactions`
- **Limits:** Maximum 100 operations and 4MB cumulative operation body bytes.
- **Body:**
  ```json
  {
    "operations": [
      { "action": "put", "collection": "users", "id": "1", "body": {"balance": 90}, "expected_etag": "hash123" },
      { "action": "put", "collection": "users", "id": "2", "body": {"balance": 110}, "expected_etag": "hash456" },
      { "action": "delete", "collection": "orders", "id": "xyz" }
    ]
  }
  ```
- **Response (200 OK):** An array of the resulting documents.

---

### Outbound Webhook Delivery

If your host/operator configured webhooks for your collection, JSONVault can
send an HTTP POST request to your backend whenever data changes. This is useful
for event-driven architectures.
*Note: JSONVault features strict SSRF protection and will block webhooks to internal or private IP addresses. Redirects are disabled, and deliveries are processed through bounded workers with per-target limits.*

#### Webhook Delivery
When an event occurs, JSONVault will send a `POST` request to your URL containing the JSON payload.
The request will include these headers:

- `X-JSONVault-Signature`: Legacy HMAC SHA-256 hash of the payload using your `webhook_secret`.
- `X-JSONVault-Timestamp`: Unix timestamp for replay-window checks.
- `X-JSONVault-Event-ID`: Monotonic JSONVault event sequence ID.
- `X-JSONVault-Signature-V2`: HMAC SHA-256 of `timestamp + "." + event_id + "." + payload` using your `webhook_secret`.

Receivers should verify `X-JSONVault-Signature-V2`, reject old timestamps, and deduplicate recent event IDs.

Webhook registration, delivery inspection, and manual retry require
`webhooks:manage` or an admin key.

---

### Discovery Endpoints

Discovery endpoints are optional. If your JWT is scoped to one known database
or collection, these may return `403 Forbidden`; your app can use the known path
directly.

#### Check Server Health
- **Request:** `GET /healthz`

#### List Databases
- **List:** `GET /api/v1/databases`
- **Access:** Requires a token broad enough to list databases, usually
  `database: "*"` or admin.

#### List Collections
- **List:** `GET /collections`
- **Access:** Requires access to the database and a token broad enough to list
  collections, usually `collection: "*"` or admin.

Database and collection creation/deletion are host-managed admin operations.
For normal app development, writes auto-create the database and collection when
your scoped key allows the target path.

---

## 🚨 4. Error Handling
All errors follow a standard, predictable JSON format:
```json
{
  "error": {
    "code": "precondition_failed",
    "message": "ETag mismatch"
  }
}
```

**Common Status Codes you might encounter:**
- `400 Bad Request`: Invalid JSON, invalid filter literal, too many filters, offset too large, or schema validation failure.
- `401 Unauthorized`: Missing or invalid Bearer token.
- `403 Forbidden`: API Key lacks required permissions.
- `404 Not Found`: Requested document or explicitly managed resource does not exist.
- `429 Too Many Requests`: Operational/admin rate limit exceeded.
- `412 Precondition Failed`: The ETag you provided does not match the server's current version (Someone else edited it!).
- `413 Payload Too Large`: Request body or normalized document exceeds the host-configured size limit.
- `415 Unsupported Media Type`: Write request is missing `Content-Type: application/json`.
- `422 Unprocessable Entity`: Query exceeded host-configured scan, response, or time budgets.
