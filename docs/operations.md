# JSONVault Operations Guide

This guide details operational playbooks for running JSONVault in production, including monitoring, logging, and backups.

## Observability & Monitoring
JSONVault exposes a Prometheus metrics endpoint to help operators monitor database health.

**Endpoint:** `GET /metrics`

**Exported Metrics:**
- `jsonvault_http_requests_total` (Counter): Total HTTP requests handled. Labeled by `method`, `path`, and `status`.
- `jsonvault_http_request_duration_seconds` (Histogram): Request latency. Labeled by `method` and `path`.
- Standard Go process metrics (Memory allocation, GC times, Goroutines).

### Structured Logging
JSONVault uses `log/slog` to output structured JSON logs to `stdout`. This integrates perfectly with log aggregators like Datadog, ElasticSearch, or Loki.
Errors occurring within the Store are clearly logged with contextual tags like `addr`, `dataDir`, and `error`.

## Backups & Restores

Because JSONVault uses `bbolt`, we can perform "Hot Backups" without stopping the server. `bbolt`'s MVCC architecture allows a read transaction to stream a perfectly consistent point-in-time snapshot of the database file while concurrent writes continue.

### Triggering a Backup
You must use an API Key with `admin` scope.
```bash
curl -X GET -H "Authorization: Bearer <your_admin_key>" \
  -o my_database.db \
  http://localhost:8080/api/v1/admin/backup/my_database
```
This streams the raw `.db` file down to the client. 

### Restoring a Backup
1. Gracefully shut down the JSONVault server (send `SIGTERM`).
2. Replace the `.db` file in your `JSONVAULT_DATA_DIR` with the downloaded snapshot.
3. Restart the server.

*Note: Since databases are isolated into separate `.db` files, you can restore a single database without affecting the others.*

## Graceful Shutdown
Always shut down JSONVault using a `SIGTERM` or `SIGINT` signal (e.g. `kill -15 <pid>`). The server will intercept this signal, gracefully drain any in-flight HTTP requests (up to `JSONVAULT_SHUTDOWN_TIMEOUT`), and cleanly close all active database file descriptors before exiting.
