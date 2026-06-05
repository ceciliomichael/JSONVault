# JSONVault API Guide

JSONVault provides a straightforward, file-backed NoSQL document database accessible via a REST API. This guide covers the full API contracts to help you integrate it into your applications.

## Client Setup

To connect your application to the JSONVault database, you will need the base URL of the JSONVault server and your secret API key.

It is highly recommended to store these in your client application's `.env` file rather than hardcoding them:

```env
# Your client application's .env file
JSONVAULT_API_KEY=your-secret-api-key
JSONVAULT_BASE_URL=https://db.yourdomain.com
```

### How to Use JSONVault (Mental Model)

JSONVault is designed to support multiple completely isolated projects on the same server, structured in a 3-tier hierarchy: **Database -> Collection -> Document**.

You can use it to:
- Store user profiles and application settings.
- Manage a small product catalog or blog posts.
- Save temporary state or cache data from other APIs.

**Hierarchy:**
1. **Database:** Think of a database as an isolated container for a single application or project (e.g., `ecommerce_db`, `blog_db`).
2. **Collection:** Within a database, a collection acts like a folder or a table (e.g., `users`, `products`).
3. **Document:** Within a collection, a document is a single entry represented by a flexible JSON object.

When you send a new document to a database and collection, JSONVault automatically creates both the database and the collection if they don't exist, assigns a unique ID to your document, and saves it safely to the disk. You can then retrieve, update, or delete that specific document using its ID.

## General Requirements

All raw REST API endpoints require authentication and specific headers.

### Authentication
Include the `Authorization` header with your Bearer token in every request.
```http
Authorization: Bearer <your-api-key>
```

### Content Type
For any request with a body (`POST`, `PUT`), the `Content-Type` header must be explicitly set to `application/json`.
```http
Content-Type: application/json
```

## Error Format

When an error occurs, the API returns a standard JSON error response:

```json
{
  "error": {
    "code": "error_code_string",
    "message": "Human readable error description"
  }
}
```

Common HTTP status codes include:
- `400 Bad Request`: Invalid JSON, invalid names, etc.
- `401 Unauthorized`: Missing or invalid API key.
- `404 Not Found`: Database, collection, document, or route does not exist.
- `405 Method Not Allowed`: HTTP method is not supported for the route.
- `413 Payload Too Large`: Request body exceeds the configured maximum size (default 10MB).
- `415 Unsupported Media Type`: `Content-Type` was not `application/json`.
- `500 Internal Server Error`: An unexpected server-side error occurred.

---

## Health Check

### `GET /healthz`
Checks if the server is running. No authentication required.

**Response (200 OK):**
```json
{
  "status": "ok"
}
```

---

## Database Management

### List Databases
`GET /api/v1/databases`
Returns an array of all database names.

**Response (200 OK):**
```json
[
  "ecommerce_db",
  "blog_db"
]
```

### Create Database
`POST /api/v1/databases`
Explicitly creates a new empty database. (Note: Databases are also created automatically when you insert the first document into them).

**Request Body:**
```json
{
  "name": "my_new_database"
}
```

**Response (201 Created or 200 OK):**
```json
{
  "name": "my_new_database",
  "created": true
}
```

### Delete Database
`DELETE /api/v1/{database}`
Permanently deletes a database and all of its collections and documents.

**Response (200 OK):**
```json
{
  "deleted": true,
  "name": "my_new_database"
}
```

---

## Collections Management

### List Collections
`GET /api/v1/{database}/collections`
Returns an array of all collection names in a database.

**Response (200 OK):**
```json
[
  "users",
  "products"
]
```

### Create Collection
`POST /api/v1/{database}/collections`
Explicitly creates a new empty collection.

**Request Body:**
```json
{
  "name": "my_new_collection"
}
```

**Response (201 Created or 200 OK):**
```json
{
  "name": "my_new_collection",
  "created": true
}
```

### Delete Collection
`DELETE /api/v1/{database}/collections/{collection}`
Permanently deletes a collection and all of its contained documents.

**Response (200 OK):**
```json
{
  "deleted": true,
  "name": "my_new_collection"
}
```

---

## Document Management

### List Documents
`GET /api/v1/{database}/{collection}`
Returns an array of all documents within the specified database and collection.

**Response (200 OK):**
```json
[
  {
    "id": "12345",
    "document": { "username": "alice" }
  },
  {
    "id": "67890",
    "document": { "username": "bob" }
  }
]
```

### Create Document
`POST /api/v1/{database}/{collection}`
Creates a new document in the database and collection with an auto-generated ID.

**Request Body:**
Any valid JSON object.
```json
{
  "username": "alice",
  "active": true
}
```

**Response (201 Created):**
```json
{
  "id": "auto-generated-id",
  "document": {
    "username": "alice",
    "active": true
  }
}
```

### Get Document
`GET /api/v1/{database}/{collection}/{id}`
Retrieves a single document by its ID.

**Response (200 OK):**
```json
{
  "id": "auto-generated-id",
  "document": {
    "username": "alice",
    "active": true
  }
}
```

### Update Document
`PUT /api/v1/{database}/{collection}/{id}`
Completely overwrites the existing document with the new JSON data.

**Request Body:**
Any valid JSON object.
```json
{
  "username": "alice_updated",
  "active": false
}
```

**Response (200 OK):**
```json
{
  "id": "auto-generated-id",
  "document": {
    "username": "alice_updated",
    "active": false
  }
}
```

### Delete Document
`DELETE /api/v1/{database}/{collection}/{id}`
Permanently removes a document from the collection.

**Response (200 OK):**
```json
{
  "collection": "users",
  "deleted": true,
  "id": "auto-generated-id"
}
```
