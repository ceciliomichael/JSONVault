# Audit 004 Implementation Plan

Date: 2026-06-07
Audit: `docs/audit/audit-004.md`
Current focus: final verification/feedback
Status: core developer self-service permission model implemented; residual
durability and richer UX follow-ups documented

Use this file as the implementation checklist for all Audit 004 findings. Keep
checkboxes updated as design decisions, code, tests, docs, and verification
land.

## Working Rules

- [x] Keep the root admin key server-only.
- [x] Do not expand `read_write` into an unsafe management role.
- [x] Preserve backwards compatibility for existing `read_only` and
  `read_write` keys.
- [x] Prefer explicit capabilities over broad implicit permissions.
- [x] Keep management operations scoped to owned database/collection resources.
- [x] Add resource quotas before exposing expensive operations to developers.
- [x] Make long-running work visible through operation status.
- [x] Document app client, project owner, dashboard/backend, and host/operator
  responsibilities separately.
- [x] Collect feedback after the Audit 004 draft.

## Overall Workflow

- [x] Create `docs/audit/audit-004.md`.
- [x] Create `docs/audit/audit-004-plan.md`.
- [x] Identify current auth and UX gaps around developer self-service.
- [x] Document why `read_write` should not manage indexes/FTS directly.
- [x] Document the safer middle permission model.
- [x] Document the target authority model: root admin owns the server; project
  owner/developer manages their own database through constrained management
  capabilities.
- [x] Collect feedback on Audit 004 scope.
- [x] Finalize Audit 004 priorities after feedback.
- [x] Start P0 implementation pass after user approval.
- [x] Finish core P0 implementation pass.
- [x] Add P0 tests.
- [x] Run P0 verification.
- [x] Start P1 implementation pass after user review.
- [x] Finish core P1 implementation pass.
- [x] Add P1 tests.
- [x] Run P1 verification.
- [x] Start P2 implementation/docs pass.
- [x] Finish implemented P2 docs/API pass.
- [x] Run P2 verification.
- [x] Start P3 docs cleanup pass.
- [x] Finish implemented P3 docs cleanup pass.
- [x] Run final verification suite.
- [x] Create `docs/audit/audit-004-summary.md`.
- [ ] Collect final feedback.

## P0 Release Blockers

### P0.1 Add A Safe Middle Permission Model

- [x] Choose final name: `project_admin`.
- [x] Define capability list:
  - [x] `metadata:read`
  - [x] `documents:read`
  - [x] `documents:write`
  - [x] `indexes:manage`
  - [x] `fts:manage`
  - [x] `schemas:manage`
  - [x] `webhooks:manage`
  - [x] `collections:manage`
  - [x] `operations:read`
  - [x] `operations:cancel`
  - [x] `keys:manage`
- [x] Define how existing scopes map to capabilities.
- [x] Preserve existing `read_only` and `read_write` JWT behavior.
- [x] Add capability parsing to JWT authentication.
- [x] Add capability checks to HTTP handlers.
- [x] Keep root `admin` as full server control.
- [x] Keep server-wide operations admin-only:
  - [x] global backups
  - [x] global restore
  - [x] metrics
  - [x] pprof
  - [x] server config
  - [x] root key generation
  - [x] arbitrary key revocation
- [x] Update generated-key API to mint constrained management tokens.
- [x] Reject unconstrained management tokens unless explicitly admin.
- [ ] Decide whether project-owned full database delete is a separate
  capability.
- [ ] Decide whether project-owned database export/backup is a separate
  capability.
- [x] Add tests for core capability and denial paths.

### P0.2 Keep `read_write` Runtime-Only

- [x] Add regression tests proving `read_write` cannot create/delete indexes.
- [x] Add regression tests proving `read_write` cannot configure FTS.
- [x] Add regression tests proving `read_write` cannot mutate schemas.
- [x] Add regression tests proving `read_write` cannot configure webhooks.
- [x] Add regression tests proving `read_write` cannot create/delete databases
  or collections.
- [x] Ensure error responses explain that a management capability is required.
- [x] Update integration guide so normal app keys are clearly runtime-only.

### P0.3 Add Management Quotas And Admission Control

- [x] Define max indexes per collection.
- [ ] Define max concurrent index builds per database/tenant.
- [x] Define max FTS fields per collection.
- [ ] Define max concurrent FTS rebuilds per database/tenant.
- [ ] Define max schema size.
- [x] Define max webhooks per collection and keep existing SSRF protection.
- [x] Define management rate limits separate from normal document operations.
- [x] Add `quota_exceeded` error shape.
- [ ] Add tests for quota rejection.
- [ ] Add metrics for active and rejected management operations.

### P0.4 Add Operation/Job Model For Long-Running Management Work

- [ ] Add persistent operation records.
- [x] Add in-memory operation states:
  - [x] `queued`
  - [x] `running`
  - [x] `ready`
  - [x] `failed`
  - [x] `canceling`
  - [x] `canceled`
- [x] Add operation fields:
  - [x] `operation_id`
  - [x] `type`
  - [x] `database`
  - [x] `collection`
  - [x] `actor`
  - [x] `created_at`
  - [x] `updated_at`
  - [x] `progress`
  - [x] `last_error`
- [x] Return `202 Accepted` with `operation_id` for async builds.
- [x] Add `GET /api/v1/operations/{operation_id}`.
- [x] Add scoped operation listing for owned resources.
- [x] Add cancellation endpoint if the operation can be safely canceled.
- [ ] Persist enough state for restart recovery.
- [x] Add tests for operation lifecycle.

### P0.5 Make `query_limit_exceeded` Actionable

- [x] Add stable reason codes:
  - [x] `scan_docs_limit`
  - [x] `scan_bytes_limit`
  - [x] `response_bytes_limit`
  - [x] `duration_limit`
  - [x] `fts_candidates_limit`
- [x] Add safe client advice:
  - [x] `lower_limit`
  - [x] `narrow_filter`
  - [x] `avoid_deep_offset`
  - [x] `request_index`
  - [x] `use_more_specific_search`
- [ ] Include candidate index recommendation when a query uses an unindexed
  equality filter.
- [x] Ensure advice does not reveal cross-tenant information.
- [x] Add regression test for actionable error shape.
- [x] Update integration guide examples.

## P1 High Priority

### P1.1 Add Scoped Identity And Metadata Endpoint

- [x] Add `GET /api/v1/me`.
- [x] Return scope/capabilities.
- [x] Return database and collection constraints.
- [ ] Return safe resource limits that affect the token.
- [x] Return allowed management features through capabilities.
- [x] Add tests for management tokens.
- [x] Update integration guide.

### P1.2 Improve Discovery Endpoint UX

- [x] Decide whether narrow `GET /databases` should return the allowed database
  instead of `403`.
- [x] Decide whether narrow `GET /{database}/collections` should return the
  allowed collection instead of `403`.
- [x] Preserve security for wildcard tokens.
- [x] Add tests for narrow database constraints.
- [x] Update docs.

### P1.3 Add Rich Index Metadata

- [x] Change index listing from strings to structured records, or add a versioned
  endpoint that returns structured records.
- [x] Include field.
- [x] Include state.
- [ ] Include progress.
- [ ] Include created time.
- [ ] Include created by.
- [ ] Include last error.
- [ ] Include approximate indexed document count when cheap enough.
- [x] Keep backwards compatibility if existing clients expect string arrays.
- [ ] Add tests for ready/building/failed metadata.

### P1.4 Add FTS Read/Status Endpoint

- [x] Add `GET /api/v1/{database}/{collection}/fts`.
- [x] Return configured fields.
- [x] Return ready/none state.
- [ ] Return last error.
- [x] Add scoped access rules.
- [x] Add tests.
- [x] Update integration and operator guides.

### P1.5 Add Schema Dry Run And Staging UX

- [x] Add schema validation-only endpoint.
- [ ] Add dry-run endpoint against existing documents.
- [ ] Return violation count and safe examples.
- [ ] Consider staged schema mode before enforcement.
- [x] Add tests for valid schema.
- [ ] Add tests for invalid schema and existing-document
  violations.
- [x] Update docs.

### P1.6 Add Developer-Safe Webhook Management

- [x] Add capability check for webhook management.
- [x] Keep SSRF protection enabled.
- [ ] Add webhook test delivery endpoint.
- [ ] Add webhook secret rotation endpoint.
- [x] Scope delivery inspection to owned database.
- [x] Add tests for allowed and denied webhook management.
- [x] Update docs.

### P1.7 Add Management Audit Log

- [x] Define in-memory audit log storage.
- [x] Record actor token ID / subject.
- [x] Record action, target, status, and timestamps.
- [ ] Record safe request summary.
- [x] Record error details.
- [x] Add scoped audit log read endpoint for project owners if safe.
- [ ] Add tests.

## P2 Medium Priority

### P2.1 Add Query Advisor Endpoint

- [x] Define actionable error advice for scoped clients.
- [ ] Recommend indexes from unindexed equality filters.
- [x] Warn on broad FTS terms through advice.
- [x] Warn on deep offset pagination through advice.
- [x] Warn on in-memory sort through advice.
- [x] Keep diagnostics safe for multi-tenant hosted use.
- [x] Add tests and docs.

### P2.2 Add Quota/Product Limit Surfaces

- [ ] Add config for index/FTS/schema/webhook management quotas.
- [ ] Expose safe per-token limits through `/me`.
- [x] Add clear `quota_exceeded` responses.
- [x] Add docs for hosts and developers.

### P2.3 Clarify Field Path Semantics

- [ ] Decide whether dotted fields mean nested paths or literal keys.
- [ ] Align filters, secondary indexes, FTS fields, and docs.
- [ ] Add tests for dotted field behavior.
- [ ] Update examples.

### P2.4 Split Runtime And Management SDK/CLI Surfaces

- [ ] Design SDK runtime client.
- [ ] Design SDK management client.
- [ ] Add CLI commands for safe local management:
  - [ ] create index
  - [ ] delete index
  - [ ] configure FTS
  - [ ] inspect operation status
  - [ ] validate schema
- [x] Ensure docs warn against shipping management credentials in frontend code.

## P3 Documentation And Polish

### P3.1 Add Product Role Glossary

- [x] Define host/operator.
- [x] Define project owner/developer.
- [x] Define app client.
- [x] Define dashboard/backend.
- [x] Define root admin key.
- [x] Define management token.
- [ ] Add glossary to docs.

### P3.2 Add Role-Based Examples

- [ ] Hosted app using `read_write`.
- [x] Project owner using management token.
- [x] Dashboard backend proxying management requests.
- [x] Host/operator using root admin key.
- [ ] Self-hosted developer running migration scripts.

### P3.3 Update Audit Summary

- [x] Create `docs/audit/audit-004-summary.md`.
- [x] Record implemented scope.
- [x] Record remaining follow-up.
- [x] Record verification commands.

## Verification Checklist

- [x] `gofmt`.
- [x] `go test ./...`.
- [x] `go test -race ./...`.
- [x] `go vet ./...`.
- [x] Focused auth/permission tests.
- [x] Focused index/FTS operation tests.
- [ ] Focused quota/admission tests.
- [x] Focused docs review for role clarity.
- [x] `git diff --check`.

## Open Decisions

- [x] Scope name: `tenant_admin`, `project_admin`, or capability-only.
- [x] Whether management tokens are intended for browser dashboards, backend
  dashboards, CLIs, or all three.
- [x] Whether index builds should always be async or only async above a size
  threshold.
- [ ] Whether schema enforcement should support staged mode in the first
  implementation.
- [ ] Whether webhook delivery inspection is safe for project owners by default.
- [ ] Whether `GET /databases` should return constrained resources for narrow
  tokens.
- [ ] Whether project owners can delete their own full database.
- [ ] Whether project owners can export/download their own full database.
