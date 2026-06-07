# JSONVault Operations Guide

This guide details operational playbooks for running JSONVault in production, including monitoring, logging, and backups.

## Observability & Monitoring
JSONVault exposes a Prometheus metrics endpoint to help operators monitor database health.

**Endpoint:** `GET /metrics`
**Authorization:** Admin key required.

**Exported Metrics:**
- `jsonvault_http_requests_total` (Counter): Total HTTP requests handled. Labeled by `method`, `path`, and `status`.
- `jsonvault_http_request_duration_seconds` (Histogram): Request latency. Labeled by `method` and `path`.
- `jsonvault_store_open_databases` (Gauge): Current open database handles.
- `jsonvault_store_data_bytes` (Gauge): Total bytes used by database files.
- `jsonvault_sse_subscribers` (Gauge): Active SSE subscribers.
- `jsonvault_webhook_queue_depth` (Gauge): Current webhook queue depth.
- Standard Go process metrics (Memory allocation, GC times, Goroutines).

### Structured Logging
JSONVault uses `log/slog` to output structured JSON logs to `stdout`. This integrates perfectly with log aggregators like Datadog, ElasticSearch, or Loki.
Errors occurring within the Store are clearly logged with contextual tags like `addr`, `dataDir`, and `error`.

## Backups & Restores

Because JSONVault uses `bbolt`, we can perform "Hot Backups" without stopping the server. JSONVault first writes a consistent point-in-time snapshot to a temporary local file, closes the bbolt read transaction, and then streams that snapshot to the client. This avoids holding old read transactions open while a client downloads slowly.

### Triggering a Backup
You must use an API Key with `admin` scope.
```bash
curl -X GET -H "Authorization: Bearer <your_admin_key>" \
  -o my_database.db \
  http://localhost:8080/api/v1/admin/backup/my_database
```
This streams the raw `.db` snapshot down to the client.

### Restoring a Backup
1. Gracefully shut down the JSONVault server (send `SIGTERM`).
2. Replace the `.db` file in your `JSONVAULT_DATA_DIR` with the downloaded snapshot.
3. Restart the server.

*Note: Since databases are isolated into separate `.db` files, you can restore a single database without affecting the others.*

## Graceful Shutdown
Always shut down JSONVault using a `SIGTERM` or `SIGINT` signal (e.g. `kill -15 <pid>`). The server will intercept this signal, gracefully drain any in-flight HTTP requests (up to `JSONVAULT_SHUTDOWN_TIMEOUT`), and cleanly close all active database file descriptors before exiting.
