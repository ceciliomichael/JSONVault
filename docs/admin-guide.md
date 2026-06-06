# JSONVault Admin & Dashboard Integrator Guide

This guide is meant strictly for the Server Administrator or the backend services of your Dashboard/Control Panel. 
**Do not expose this information to normal users.**

## The Admin Key
The `JSONVAULT_ADMIN_KEY` configured in your `.env` file grants root access to the entire server.

### Generating Scoped API Keys (JWTs)
Your dashboard backend should use the Admin Key to programmatically generate restricted API keys for your users.

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
- **Response (201 Created):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "scope": "read_write",
    "database": "proj_abc123",
    "collection": "*"
  }
  ```

### Option 2: Offline Generation (For Dashboard Backends)
If you are building a dashboard (like Firebase/Supabase), your backend doesn't even need to hit the JSONVault API to create keys! Because JWTs are stateless, your backend can generate the token instantly using any standard JWT library in any language (Go, Python, PHP, Node.js, Ruby, etc.).

**Requirements:**
1. **Algorithm:** HMAC SHA-256 (`HS256`)
2. **Secret:** The exact string value of your `JSONVAULT_JWT_SECRET`.
3. **Payload:** A standard JSON object with the following fields:
   - `scope`: String (either `"read_only"`, `"read_write"`, or `"admin"`)
   - `database`: String (the specific database name, or `"*"` for all)
   - `collection`: String (the specific collection name, or `"*"` for all)

Once your backend signs this payload, the resulting token string is immediately valid on your JSONVault server!
Provide this `"token"` string to the user so they can connect their frontend app to their specific database!

## Key Revocation & Expiration
Because JSONVault uses **Stateless JWTs**, the tokens are not saved anywhere on the JSONVault server disk. They only exist mathematically. 

If your `JSONVAULT_JWT_SECRET` is ever compromised, or if you want to globally invalidate all active API keys ever issued, you simply change `JSONVAULT_JWT_SECRET` in your `.env` file and restart the server. **All old keys will instantly stop working.**
