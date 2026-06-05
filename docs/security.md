# JSONVault Security Guide

This guide explains the mechanisms JSONVault uses to ensure data security, multi-tenant isolation, and resource protection.

## Scoped API Keys (RBAC)
JSONVault utilizes a bearer-token model. However, to support safe, isolated access for untrusted clients or microservices, JSONVault implements Role-Based Access Control via the `JSONVAULT_API_KEYS` environment variable.

Keys are defined in a comma-separated list, with optional `:scope` suffixes:
`secret_admin,read_only_key:read_only,app_key:read_write`

- `admin`: (Default) Full access to all endpoints, including `DELETE /api/v1/{database}` and `GET /api/v1/admin/backup`.
- `read_write`: Can read, create, update, and delete documents. Can create databases and collections. Cannot delete databases.
- `read_only`: Can only read databases, collections, and documents. All mutating requests return `403 Forbidden`.

## Optimistic Concurrency Control (ETags)
In a highly concurrent REST API, two clients fetching the same document and modifying it can result in a "Lost Update" where one client silently overwrites the other.
To prevent this, JSONVault computes an `ETag` (SHA-256 hash) for every document payload. 
Clients pass this `ETag` in the `If-Match` header on `PUT`, `PATCH`, and `DELETE` requests. If the document has changed on disk since the client read it, the server rejects the request with `412 Precondition Failed`.

## At-Rest Encryption (AES-GCM)
By providing a 64-character (32-byte) hex string to `JSONVAULT_ENCRYPTION_KEY`, JSONVault enables Application-Level Value Encryption.
- When `CreateDocument`, `PutDocument`, or `PatchDocument` is called, the JSON payload is encrypted using AES-GCM before it is written to the `bbolt` database.
- A `0x00` magic byte is prepended to the ciphertext.
- When reading, JSONVault checks for the `0x00` byte. If found, it seamlessly decrypts the payload. If missing, it assumes the data is plaintext (enabling seamless migrations of legacy data).
*Note: This encrypts the document contents, but the database and collection names, as well as document IDs, remain in plaintext.*

## Resource Limits
To prevent CPU or Memory exhaustion (OOM), JSONVault enforces strict query limits on `GET /api/v1/{database}/{collection}`:
- Max `limit`: 1000
- Max `offset`: 10000
- Max `filter` fields: 5

Additionally, the request body size is capped at `10MB` by default, configurable via `JSONVAULT_MAX_BODY_BYTES`.
