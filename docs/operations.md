# JSONVault Operations Guide

This guide details operational playbooks for running JSONVault in production, including monitoring, logging, and backups.

## Production Readiness Checklist

- Set `JSONVAULT_ADMIN_KEY` and `JSONVAULT_JWT_SECRET` to long random secrets.
- Use `JSONVAULT_ENCRYPTION_REQUIRED=true` after migrating any legacy plaintext documents.
- Choose `JSONVAULT_PROFILE=tiny`, `default`, or `large` for the host size.
- Confirm `JSONVAULT_MAX_DOCUMENT_BYTES`, query budgets, and response budgets match your workload.
- Create indexes for repeated filters and avoid deep offset pagination for large collections.
- Configure `JSONVAULT_BACKUP_TEMP_DIR` on storage with enough free space.
- Run a restore drill with `jsonvault restore`.
- Monitor `/metrics`, especially request latency, open databases, data bytes, subscribers, and webhook queue depth.
- Review failed webhook deliveries and retry or fix receivers.
- Keep optional `JSONVAULT_PPROF_ADDR` disabled unless diagnosing locally.

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

`jsonvault_store_data_bytes` is cached briefly so frequent scrapes do not walk
the data directory on every request.

### Structured Logging
JSONVault uses `log/slog` to output structured JSON logs to `stdout`. This integrates perfectly with log aggregators like Datadog, ElasticSearch, or Loki.
Errors occurring within the Store are clearly logged with contextual tags like `addr`, `dataDir`, and `error`.

## Backups & Restores

Because JSONVault uses `bbolt`, we can perform "Hot Backups" without stopping the server. JSONVault first writes a consistent point-in-time snapshot to a temporary local file, closes the bbolt read transaction, and then streams that snapshot to the client. This avoids holding old read transactions open while a client downloads slowly.

Backup snapshots use `JSONVAULT_BACKUP_TEMP_DIR`, or
`JSONVAULT_DATA_DIR/_tmp/backups` when not configured. JSONVault checks free
space before snapshotting and rejects the request when the temp directory cannot
hold the snapshot plus margin. Backups are limited by
`JSONVAULT_BACKUP_CONCURRENCY`.

### Triggering a Backup
You must use an API Key with `admin` scope.
```bash
curl -X GET -H "Authorization: Bearer <your_admin_key>" \
  -o my_database.db \
  http://localhost:8080/api/v1/admin/backup/my_database
```
This streams the raw `.db` snapshot down to the client.

## Webhook Delivery Recovery

Committed document mutation events are stored in a durable webhook outbox before
delivery. If JSONVault restarts after committing a document but before delivering
the webhook, the worker resumes from the outbox.

Inspect deliveries:
```bash
curl -H "Authorization: Bearer <your_admin_key>" \
  "http://localhost:8080/api/v1/admin/webhooks/my_database/deliveries?status=failed"
```

Retry a failed delivery:
```bash
curl -X POST -H "Authorization: Bearer <your_admin_key>" \
  "http://localhost:8080/api/v1/admin/webhooks/my_database/deliveries/123/retry"
```

Transient `publish` events are best-effort and are not stored in the outbox.

### Restoring a Backup
1. Gracefully shut down the JSONVault server (send `SIGTERM`).
2. Run the offline restore command:
   ```bash
   jsonvault restore -data-dir ./data -database my_database -backup ./my_database.db -force
   ```
3. Restart the server.

*Note: Since databases are isolated into separate `.db` files, you can restore a single database without affecting the others.*

## Graceful Shutdown
Always shut down JSONVault using a `SIGTERM` or `SIGINT` signal (e.g. `kill -15 <pid>`). The server will intercept this signal, gracefully drain any in-flight HTTP requests (up to `JSONVAULT_SHUTDOWN_TIMEOUT`), and cleanly close all active database file descriptors before exiting.
