# JSONVault Client Integration Guide

Welcome to JSONVault! This guide is written for frontend and backend developers who need to connect their applications to a JSONVault database. 

JSONVault is a NoSQL document database built for speed and developer experience. It operates over a simple REST API and features built-in Real-Time Subscriptions.

Data is organized into a strict hierarchy: **Database -> Collection -> Document**.

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

JSONVault uses **Stateless JSON Web Tokens (JWT)** for scoped access. 

You should receive an API Key (JWT) from your Dashboard Provider.

### Accessing the Database
Every HTTP request (except `/healthz`) MUST include the generated token in the header:

```http
Authorization: Bearer <your-generated-jwt-token>
Content-Type: application/json
```
*(Note: `Content-Type` is strictly required for POST, PUT, and PATCH requests).*

If you receive a `403 Forbidden` error or a `401 Unauthorized` error, your JWT Token does not have the required permissions for that specific database/collection.

---

## 📡 3. The API Reference

### Real-Time Subscriptions

#### Stream Collection Updates
Open a persistent HTTP connection to receive live document mutations.
- **Request:** `GET /api/v1/{database}/{collection}/subscribe`
- **Response:** Infinite stream of `text/event-stream`
- **Event Format:**
  ```text
  data: {"action":"insert","database":"{db}","collection":"{coll}","document_id":"<id>","etag":"<new_etag>","document":{...}}
  
  data: {"action":"update","database":"{db}","collection":"{coll}","document_id":"<id>","etag":"<new_etag>","document":{...}}
  
  data: {"action":"delete","database":"{db}","collection":"{coll}","document_id":"<id>"}
  ```
*(Note: To prevent proxies from dropping idle connections, JSONVault sends a silent `: keepalive` comment every 15 seconds. Standard EventSource clients handle this automatically).*

#### Publish Transient Message (Pub/Sub)
Instantly broadcast a JSON message to all active SSE subscribers without saving it to the database disk. Perfect for ephemeral events like "User is typing...".
- **Request:** `POST /api/v1/{database}/{collection}/publish`
- **Body:** Any valid JSON object (Max 100KB).
- **Response (202 Accepted):** `{"status": "published"}`

#### Real-Time Presence
Get the exact number of active SSE connections currently subscribed to a collection. Perfect for showing "Online Users".
- **Request:** `GET /api/v1/{database}/{collection}/presence`
- **Response (200 OK):** `{"database": "my_app", "collection": "users", "subscribers": 42}`

---

### Documents (CRUD)

#### List Documents
Retrieve a paginated list of documents, optionally filtered and sorted directly in the query string.
- **Request:** `GET /api/v1/{database}/{collection}`
  - **Query Parameters:**
    - `limit` (max: 1000, default: 100)
    - `offset` (max: 10000, default: 0)
    - `sort` (e.g., `?sort=age` for ascending, or `?sort=-created_at` for descending)
    - `filter[<field>]` (e.g., `?filter[status]=%22active%22&filter[age]=30`)
      *Note: Filter values must be valid JSON strings (e.g. `%22string%22` for strings, `true` for booleans, `42` for numbers).*
- **Response (200 OK):** An array of documents. (Pagination metadata is returned in `X-Total-Count`, `X-Limit`, `X-Offset` headers).

#### Create Document
- **Request:** `POST /api/v1/{database}/{collection}`
- **Headers:** `X-Expire-In: <seconds>` (Optional: Automatically delete document after X seconds)
- **Body:** Any valid JSON object.
- **Response (201 Created):** Returns the auto-generated `id` and the generated `ETag` header.

#### Get Document by ID
- **Request:** `GET /api/v1/{database}/{collection}/{id}`
- **Response (200 OK):** Returns the document and its `ETag` header.

#### Update or Create Document (Upsert)
Completely overwrites the document if it exists, or creates a new document using the `{id}` you provide.
- **Request:** `PUT /api/v1/{database}/{collection}/{id}`
- **Headers:** 
  - `If-Match: <your-etag>` (Optional, but highly recommended if updating)
  - `X-Expire-In: <seconds>` (Optional: Automatically delete document after X seconds)
- **Body:** The full new JSON object.

#### Partial Update Document (Merge)
Updates specific fields while preserving the rest (e.g. only updating `status: "completed"`).
- **Request:** `PATCH /api/v1/{database}/{collection}/{id}`
- **Headers:** `If-Match: <your-etag>` (Optional, but highly recommended)
- **Body:** A JSON object containing only the fields to modify.

#### Delete Document
- **Request:** `DELETE /api/v1/{database}/{collection}/{id}`
- **Headers:** `If-Match: <your-etag>` (Optional)

---

### Schemas & Validation (Optional)

JSONVault is schemaless by default! However, if you want to strictly enforce data integrity on a collection, you can apply a Draft-07 JSON Schema.

#### Set or Update a Schema
- **Request:** `PUT /api/v1/{database}/{collection}/schema`
- **Body:** Your valid JSON Schema object.
- **Response (200 OK):** `{"updated": true}`
*(Note: Once a schema is set, any `POST`/`PUT`/`PATCH` that violates the schema will be immediately rejected with a `400 Bad Request`).*

#### Get Current Schema
- **Request:** `GET /api/v1/{database}/{collection}/schema`
- **Response (200 OK):** Returns the current JSON Schema, or `{"schema": null}` if none is set.

#### Delete Schema
- **Request:** `DELETE /api/v1/{database}/{collection}/schema`
- **Response (200 OK):** `{"deleted": true}`

---

### Secondary Indexes

By default, queries using `?filter[...]` perform a full collection scan. For massive collections, you can create Secondary Indexes to achieve sub-millisecond lookups.

#### Create an Index
- **Request:** `POST /api/v1/{database}/{collection}/indexes`
- **Body:** `{"field": "email"}`
- **Response (201 Created):** `{"created": true}`
*(Note: Creating an index automatically backfills all existing documents. The specified field will now use the B-Tree fast path during `GET` queries).*

#### List Indexes
- **Request:** `GET /api/v1/{database}/{collection}/indexes`
- **Response (200 OK):** `{"indexes": ["email", "status"]}`

#### Delete an Index
- **Request:** `DELETE /api/v1/{database}/{collection}/indexes/{field}`
- **Response (200 OK):** `{"deleted": true}`

---

### Full-Text Search (FTS)

JSONVault includes a native high-performance inverted index engine allowing you to search for specific words or phrases inside your documents.

#### 1. Configure Indexed Fields

First, define which fields in your collection should be indexed for Full-Text Search.

```bash
curl -X POST "http://localhost:8080/api/v1/store/users/fts" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"fields": ["name", "bio"]}'
```

#### 2. Querying

You can use the `search` query parameter to instantly intersect tokens and find matching documents. 
For multiple words, standard URL encoding applies (e.g. `fast+car`).

```bash
# Find any users where "john" is mentioned in their name or bio
curl "http://localhost:8080/api/v1/store/users?search=john" \
  -H "Authorization: Bearer <your_jwt_token>"

# Combine Full-Text Search with B-Tree filters
curl "http://localhost:8080/api/v1/store/users?search=engineer&filter[status]=%22active%22" \
  -H "Authorization: Bearer <your_jwt_token>"
```

---

### Atomic Transactions

JSONVault supports ACID-compliant atomic transactions, allowing you to update multiple documents at exactly the same time. If any single operation fails (e.g. invalid JSON, missing ETag), the entire transaction rolls back.

- **Request:** `POST /api/v1/{database}/transactions`
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

### Outbound Webhooks

JSONVault can automatically send an HTTP POST request to your backend whenever data changes. This is extremely useful for event-driven architectures.
*Note: JSONVault features strict SSRF protection and will block webhooks to internal or private IP addresses.*

#### Register Webhooks
- **Request:** `PUT /api/v1/{database}/{collection}/webhooks`
- **Body:**
  ```json
  {
    "webhooks": [
      { "url": "https://api.myapp.com/webhook", "events": ["insert", "update", "delete"] }
    ]
  }
  ```
- **Response (200 OK):** Returns a `webhook_secret`. Keep this secret safe! JSONVault will use it to cryptographically sign the webhook payloads it sends you.

#### Webhook Delivery
When an event occurs, JSONVault will send a `POST` request to your URL containing the JSON payload.
The request will include an `X-JSONVault-Signature` header. This is an HMAC SHA-256 hash of the payload using your `webhook_secret`. You MUST compute the hash on your backend and compare it to this header to ensure the webhook legitimately came from JSONVault.

---

### Administrative Endpoints

#### Check Server Health
- **Request:** `GET /healthz`

#### List / Delete Databases
- **List:** `GET /api/v1/databases`
- **Delete:** `DELETE /api/v1/{database}` *(Requires Admin API Key)*

#### List / Delete Collections
- **List:** `GET /api/v1/{database}/collections`
- **Delete:** `DELETE /api/v1/{database}/collections/{collection}`

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
- `400 Bad Request`: Invalid JSON, too many filters, or offset too large.
- `401 Unauthorized`: Missing or invalid Bearer token.
- `403 Forbidden`: API Key lacks required permissions.
- `412 Precondition Failed`: The ETag you provided does not match the server's current version (Someone else edited it!).
- `413 Payload Too Large`: Request body exceeds the 10MB limit.
