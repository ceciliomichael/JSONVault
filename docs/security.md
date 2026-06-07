# JSONVault Security Guide

This guide explains the mechanisms JSONVault uses to ensure data security, multi-tenant isolation, and resource protection.

## Scoped API Keys (RBAC)
JSONVault uses bearer tokens. The configured `JSONVAULT_ADMIN_KEY` is the root administrative key, and scoped client access is provided with JWTs signed by `JSONVAULT_JWT_SECRET`.

Generate scoped client keys with `POST /api/v1/admin/keys`, or sign them from a trusted backend using the same JWT secret. Generated keys include expiration and token ID claims (`exp`, `iat`, `nbf`, and `jti`).

- `admin`: Full access to all endpoints, including database/collection management, schemas, indexes, FTS config, webhooks, key creation/revocation, `DELETE /api/v1/{database}`, and `GET /api/v1/admin/backup/{database}`.
- `read_write`: Can read, create, update, patch, delete, transact on documents, and publish transient events within its JWT database/collection constraints. It cannot manage databases, collections, schemas, indexes, FTS config, webhooks, keys, or backups.
- `read_only`: Can only read databases, collections, and documents. All mutating requests return `403 Forbidden`.

Revoke one generated JWT with `DELETE /api/v1/admin/keys/{jti}`. The main server persists revoked token IDs under `JSONVAULT_DATA_DIR`.

Admin and operational routes are rate-limited per bearer token or client IP. Configure the default with `JSONVAULT_ADMIN_RATE_LIMIT_PER_MINUTE`.

## Optimistic Concurrency Control (ETags)
In a highly concurrent REST API, two clients fetching the same document and modifying it can result in a "Lost Update" where one client silently overwrites the other.
To prevent this, JSONVault computes an `ETag` (SHA-256 hash) for every document payload. 
Clients pass this `ETag` in the `If-Match` header on `PUT`, `PATCH`, and `DELETE` requests. If the document has changed on disk since the client read it, the server rejects the request with `412 Precondition Failed`.

## At-Rest Encryption (AES-GCM)
By providing a 64-character (32-byte) hex string to `JSONVAULT_ENCRYPTION_KEY`, JSONVault enables Application-Level Value Encryption.
- When `CreateDocument`, `PutDocument`, or `PatchDocument` is called, the JSON payload is encrypted using AES-GCM before it is written to the `bbolt` database.
- A `0x00` magic byte is prepended to the ciphertext.
- When reading, JSONVault checks for the `0x00` byte. If found, it seamlessly decrypts the payload. If missing, it assumes the data is plaintext (enabling seamless migrations of legacy data).
- Set `JSONVAULT_ENCRYPTION_REQUIRED=true` to fail startup unless a valid 32-byte encryption key is configured and to reject legacy plaintext documents until they are migrated.
*Note: This encrypts the document contents, but the database and collection names, as well as document IDs, remain in plaintext.*

## Webhook Replay Protection
Webhook deliveries include `X-JSONVault-Timestamp`, `X-JSONVault-Event-ID`, and `X-JSONVault-Signature-V2`. Receivers should verify the V2 signature, reject timestamps outside a short replay window, and deduplicate recent event IDs.

## Resource Limits
To prevent CPU or Memory exhaustion (OOM), JSONVault enforces strict query limits on `GET /api/v1/{database}/{collection}`:
- Max `limit`: 1000
- Max `offset`: 10000
- Max `filter` fields: 5

Additionally, the request body size is capped at `10MB` by default, configurable via `JSONVAULT_MAX_BODY_BYTES`.
