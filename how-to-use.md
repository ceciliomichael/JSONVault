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

JSONVault is ideal for lightweight applications, prototypes, or any system where you need persistent storage without the overhead of a massive database engine. 

You can use it to:
- Store user profiles and application settings.
- Manage a small product catalog or blog posts.
- Save temporary state or cache data from other APIs.

**Collections & Documents:**
Think of a **Collection** as a folder or a table (e.g., `users`, `products`). 
Think of a **Document** as a single entry within that collection, represented by a flexible JSON object. 

When you send a new document to a collection, JSONVault automatically creates the collection folder if it doesn't exist, assigns a unique ID to your document, and saves it safely to the disk. You can then retrieve, update, or delete that specific document using its ID.

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
- `400 Bad Request`: Invalid JSON, invalid collection names, etc.
- `401 Unauthorized`: Missing or invalid API key.
- `404 Not Found`: Collection, document, or route does not exist.
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

## Collections Management

### List Collections
`GET /api/v1/collections`
Returns an array of all collection names.

**Response (200 OK):**
```json
[
  "users",
  "products"
]
```

### Create Collection
`POST /api/v1/collections`
Explicitly creates a new empty collection. (Note: Collections are also created automatically when you insert the first document into them).

**Request Body:**
```json
{
  "name": "my_new_collection"
}
```

**Response (201 Created or 200 OK):**
If the collection was newly created, it returns `201 Created`. If it already existed, it safely ignores the request and returns `200 OK`.
```json
{
  "name": "my_new_collection",
  "created": true
}
```

### Delete Collection
`DELETE /api/v1/collections/{collection}`
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
`GET /api/v1/{collection}`
Returns an array of all documents within the specified collection.

**Response (200 OK):**
```json
[
  {
    "id": "12345",
    "document": { ... }
  },
  {
    "id": "67890",
    "document": { ... }
  }
]
```
*(Note: The exact structure depends on the `store.Document` struct implementation, but it typically wraps the ID and the raw JSON data).*

### Create Document
`POST /api/v1/{collection}`
Creates a new document in the collection with an auto-generated ID.

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
`GET /api/v1/{collection}/{id}`
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
`PUT /api/v1/{collection}/{id}`
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
`DELETE /api/v1/{collection}/{id}`
Permanently removes a document from the collection.

**Response (200 OK):**
```json
{
  "collection": "users",
  "deleted": true,
  "id": "auto-generated-id"
}
```
