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

Provide this `"token"` string to the user so they can connect their frontend app to their specific database!

## Key Revocation & Expiration
Because JSONVault uses **Stateless JWTs**, the tokens are not saved anywhere on the JSONVault server disk. They only exist mathematically. 

If your `JSONVAULT_JWT_SECRET` is ever compromised, or if you want to globally invalidate all active API keys ever issued, you simply change `JSONVAULT_JWT_SECRET` in your `.env` file and restart the server. **All old keys will instantly stop working.**
