# JSONVault Admin & Dashboard Integrator Guide

This guide is meant strictly for the Server Administrator or the backend services of your Dashboard/Control Panel. 
**Do not expose this information to normal users.**

## The Admin Key
The `JSONVAULT_ADMIN_KEY` configured in your `.env` file grants root access to the entire server.

### Generating Scoped API Keys (JWTs)
Your dashboard backend should use the Admin Key to programmatically generate
restricted API keys for your users. Keep the root admin key on trusted
server-side infrastructure only.

- **Request:** `POST /api/v1/admin/keys`
- **Headers:** `Authorization: Bearer <your-admin-key>`
- **Body:**
  ```json
  {
    "scope": "read_write",
    "database": "proj_abc123",
    "collection": "*" 
  }
  ```

For trusted project dashboards, CLIs, or backend tools, you can mint a
database-constrained project management token:

```json
{
  "scope": "project_admin",
  "database": "proj_abc123",
  "collection": "*",
  "capabilities": [
    "metadata:read",
    "documents:read",
    "documents:write",
    "indexes:manage",
    "fts:manage",
    "schemas:manage",
    "webhooks:manage",
    "collections:manage",
    "operations:read",
    "operations:cancel",
    "keys:manage"
  ]
}
```

Do not put project management tokens in browser or mobile runtime code. Use
normal `read_only` or `read_write` keys for app clients.
- **Response (201 Created):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "jti": "1f6d2d2b8c9a4e0d9f1b2c3a4d5e6f70",
    "expires_at": "2026-09-05T12:00:00Z",
    "scope": "read_write",
    "database": "proj_abc123",
    "collection": "*"
  }
  ```

### Option 2: Offline Generation (For Dashboard Backends)
If you are building a dashboard (like Firebase/Supabase), your backend doesn't need to hit the JSONVault API to create keys. Your backend can generate the JWT instantly using any standard JWT library in any language (Go, Python, PHP, Node.js, Ruby, etc.).

**Requirements:**
1. **Algorithm:** HMAC SHA-256 (`HS256`)
2. **Secret:** The exact string value of your `JSONVAULT_JWT_SECRET`.
3. **Payload:** A standard JSON object with the following fields:
   - `scope`: String (`"read_only"`, `"read_write"`, or `"project_admin"`).
     The root `"admin"` scope is reserved for `JSONVAULT_ADMIN_KEY` and is not
     accepted from signed user JWTs.
   - `database`: String (the specific database name, or `"*"` for all)
   - `collection`: String (the specific collection name, or `"*"` for all)
   - `capabilities`: Optional array of management capability strings for
     constrained project management tokens.
   - `iat`: Issued-at Unix timestamp
   - `nbf`: Not-before Unix timestamp
   - `exp`: Expiration Unix timestamp
   - `jti`: Unique token ID used for revocation

Once your backend signs this payload, the resulting token string is immediately valid on your JSONVault server!
Provide runtime `read_only` or `read_write` tokens to app clients. Provide
project management tokens only to trusted dashboard/backend/CLI contexts.

## Key Revocation & Expiration
Keys generated through `POST /api/v1/admin/keys` expire automatically after 90 days.

To revoke one key, store the returned `jti` when you create it and call:

- **Request:** `DELETE /api/v1/admin/keys/{jti}`
- **Headers:** `Authorization: Bearer <your-admin-key>`
- **Response (200 OK):**
  ```json
  {
    "revoked": true,
    "jti": "1f6d2d2b8c9a4e0d9f1b2c3a4d5e6f70"
  }
  ```

The main JSONVault server persists revoked token IDs in `revoked-jwts.json` under `JSONVAULT_DATA_DIR`.

If your `JSONVAULT_JWT_SECRET` is ever compromised, or if you want to globally invalidate all active API keys ever issued, change `JSONVAULT_JWT_SECRET` in your `.env` file and restart the server. **All old keys will instantly stop working.**

## Server Security & Webhook SSRF

JSONVault features strict **Server-Side Request Forgery (SSRF) Protection** on Outbound Webhooks out of the box. Users cannot configure webhooks that target `localhost`, `127.0.0.1`, or any internal/private network addresses.

If you are running automated tests or specifically need to allow users to trigger webhooks against local development servers, you can disable this protection by setting an environment variable before starting the JSONVault server:

```bash
JSONVAULT_ALLOW_LOCAL_WEBHOOKS=true
```
*(Warning: Never enable this in production!)*
