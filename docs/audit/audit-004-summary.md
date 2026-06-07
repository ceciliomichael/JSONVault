# Audit 004 Implementation Summary

Date: 2026-06-07
Audit: `docs/audit/audit-004.md`
Plan: `docs/audit/audit-004-plan.md`
Status: core developer self-service permission model implemented; residual
durability and richer UX follow-ups documented

## What Changed

### Permission Model

- Added `project_admin` JWT scope.
- Added explicit JWT capability claims:
  - `metadata:read`
  - `documents:read`
  - `documents:write`
  - `indexes:manage`
  - `fts:manage`
  - `schemas:manage`
  - `webhooks:manage`
  - `collections:manage`
  - `operations:read`
  - `operations:cancel`
  - `keys:manage`
- Preserved existing `read_only` and `read_write` behavior.
- Kept normal `read_write` runtime-only for document APIs.
- Reserved root `admin` scope for `JSONVAULT_ADMIN_KEY`; signed user JWTs with
  `scope: "admin"` are rejected.
- Added capability-aware handler checks for project-owned management actions.

### Token And Identity UX

- `POST /api/v1/admin/keys` can now mint constrained `project_admin` tokens.
- Project managers with `keys:manage` can mint only scoped `read_only` or
  `read_write` runtime keys inside their own constraints.
- Added `GET /api/v1/me` to return scope, database/collection constraints,
  token ID, and capabilities.
- Narrow scoped database discovery now returns the allowed database instead of
  failing only because the route lacks a database parameter.
- Narrow collection discovery returns the allowed collection when the token is
  collection-constrained.

### Developer Management APIs

- `indexes:manage` can create/delete indexes within token constraints.
- `GET /indexes?details=true` returns structured ready-state index metadata
  while keeping the old default string-list response.
- Added index quota guard for maximum managed indexes per collection.
- `fts:manage` can configure FTS fields within token constraints.
- Added `GET /fts` to inspect configured FTS fields and state.
- Added FTS field-count quota guard.
- `schemas:manage` can set/delete schemas within token constraints.
- Added `POST /schema/validate` to validate a schema without storing it.
- `webhooks:manage` can configure webhooks within token constraints.
- Database-level `webhooks:manage` can inspect and retry webhook deliveries for
  that database.
- `collections:manage` can create/delete collections within token constraints.

### Operations And Audit

- Added in-memory management operation tracking:
  - `GET /api/v1/operations`
  - `GET /api/v1/operations/{operation_id}`
  - `POST /api/v1/operations/{operation_id}/cancel`
- Index and FTS configuration support `?async=true` to return an operation
  record instead of blocking the request.
- Added in-memory management audit records:
  - `GET /api/v1/audit`
- Management actions record actor, action, target, status, timestamps, and error
  text when available.

### Query UX

- `query_limit_exceeded` responses now include stable `reason` and `advice`
  fields for list queries.
- Implemented reason mapping for scan-docs, scan-bytes, response-bytes,
  FTS-candidates, duration, and generic resource limits.
- Advice can include lower limit, narrow filter, request index, avoid deep
  offset, narrow before sort, and use more specific search.

### Documentation

- Updated `docs/integration-guide.md` to distinguish runtime app keys from
  project management tokens.
- Updated `docs/operator-guide.md` with `project_admin`, capabilities,
  `/me`, operations, audit, FTS status, schema validation, and management
  endpoint capability requirements.
- Updated `docs/admin-guide.md` with safe project-management token minting and
  offline JWT guidance.

## Tests Added Or Updated

- Project admin can manage owned database features.
- Project admin cannot manage another database.
- Project admin can mint only scoped runtime keys, not stronger management keys.
- Async index operation status becomes visible.
- `query_limit_exceeded` includes reason and advice.
- Signed `admin` JWTs are rejected.
- Project-admin capability defaults round-trip through JWT auth.
- Existing read-write structural denial tests continue to protect runtime-only
  app keys.
- Scoped database discovery test now protects the developer-friendly list result.

## Verification Commands

Passed:

```powershell
gofmt
go test ./internal/httpapi
go test ./...
go vet ./...
go test -race ./...
git -C .. diff --check
```

## Remaining Follow-Up

These are not hidden or claimed as solved:

- Operation and audit records are currently in-memory. Persistent operation/audit
  storage is still needed for restart recovery and production-grade history.
- Operation progress is coarse. Index/FTS builds need real progress counters.
- FTS async operations are not cancellable yet.
- Management quotas are hard-coded in the HTTP layer. They should become config
  and possibly plan/tenant limits.
- Quota metrics for active/rejected management operations are still follow-up.
- Schema validation exists, but full dry-run against existing collection
  documents and staged schema enforcement are still follow-up.
- Webhook test delivery and secret rotation endpoints are still follow-up.
- Index metadata has `field` and `state`; created-by, created-at, failed state,
  progress, and indexed document counts are still follow-up.
- Candidate index recommendation is not yet included in query advice.
- Full database delete/export for project owners remains an explicit product
  decision.
- SDK/CLI split for runtime versus management clients remains follow-up.
