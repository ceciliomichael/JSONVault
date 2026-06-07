# JSONVault Developer Self-Service UX And Permission Audit 004

Date: 2026-06-07
Target: `jsonvault-core`
Status: core implementation completed; residual follow-up documented in
`docs/audit/audit-004-summary.md`
Primary target: safe developer-friendly management of indexes, FTS, schemas,
webhooks, and metadata without exposing the root admin key

## Validation Performed

- Inspected current auth scopes in `internal/auth/auth.go`.
- Inspected route authorization in `internal/httpapi/server.go` and handlers for
  indexes, FTS, schemas, webhooks, databases, collections, and key creation.
- Inspected store validation and safety boundaries for fields, FTS, index
  creation, and webhooks.
- Rechecked the current client/operator documentation split created during
  Audit 003.
- Implementation was completed after the initial audit draft; see
  `docs/audit/audit-004-summary.md` for changed code, verification, and
  remaining follow-up.

## Product Problem

JSONVault currently has a hard split:

- `read_only`: read documents and metadata where route constraints allow it.
- `read_write`: read, write, transact, subscribe, and publish within scoped
  database/collection constraints.
- `admin`: complete server control.

That split is safe, but not developer-friendly enough for hosted JSONVault. An
app developer who owns a project often needs to create an index, configure FTS,
inspect query performance, attach a schema, or configure webhooks after the host
has already issued their project key. Today they must ask the host/operator, or
the host must build a private dashboard that uses the root admin key behind the
scenes.

The opposite approach, allowing normal `read_write` keys to create indexes or
change FTS directly, is not safe. Index builds and FTS rebuilds can scan large
collections, consume disk and CPU, block writes, trigger memory pressure, and
affect other tenants. Webhooks can create SSRF and outbound traffic risk.
Schemas can break writes immediately. These features need a safe middle
permission model.

## Desired UX

The developer should feel empowered after receiving their database key:

- They can see what database and collection their key can access.
- They can understand why a query is slow or rejected.
- They can request or create safe indexes for fields they query often.
- They can configure FTS fields, schemas, and webhooks when their project plan
  allows it.
- They get progress, status, and clear errors for long-running management work.
- They never receive the root `JSONVAULT_ADMIN_KEY`.
- The host keeps control over global safety, quotas, hardware, backups, and
  server configuration.

## Correct Authority Model

The right product split is:

- **Root admin / host / operator** manages the whole JSONVault server.
- **Project owner / developer** manages the whole database they own, through a
  constrained management token or trusted dashboard session.
- **App client** uses a runtime `read_only` or `read_write` key for document
  APIs only.

"Manage the whole database they own" should mean the project owner can manage
database-local product features such as:

- collections in their database;
- secondary indexes for their collections;
- FTS fields for their collections;
- schemas for their collections;
- webhooks for their collections;
- query advisor/explain output for their collections;
- operation status for their database-local management work;
- scoped runtime keys for their app if the product chooses to support
  project-owned key management.

It should not automatically mean they can manage server-wide host operations:

- server environment variables and profiles;
- encryption root material;
- pprof and global metrics;
- global backup/restore;
- other tenants' databases;
- root admin key generation;
- arbitrary key revocation;
- machine-level resource limits.

Some database-owned destructive or heavy operations, such as deleting the whole
database or exporting a full database backup, can be added later as separate
capabilities. They should not be bundled into basic document `read_write`.

## Recommended Direction

Add a constrained project/developer management permission model instead of using
`read_write` or `admin` for everything.

Recommended shape:

- Add a new scope such as `tenant_admin` or `project_admin`.
- Prefer capability claims over one broad scope when possible:
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
- Keep database and collection constraints mandatory for developer management
  keys.
- Keep server-wide operations admin-only:
  - global backup and restore
  - metrics and pprof
  - server config and profiles
  - key generation for other tenants
  - global database deletion outside the token's constraints
  - revocation of arbitrary keys

This lets a hosted dashboard issue a developer-safe management key without
handing out the root admin key.

## P0 Findings

### P0.1 No Safe Middle Permission Model

**Evidence**

- `internal/auth/auth.go` defines only `admin`, `read_write`, and `read_only`.
- `internal/httpapi/handlers_admin.go` only mints `read_write` and `read_only`
  JWTs.
- Index creation/deletion, FTS configuration, schema mutation, webhook
  configuration, collection creation, and database creation currently require
  `admin`.

**Why it matters**

The current model forces a bad choice:

- ask the host for every index/FTS/schema/webhook change; or
- expose the admin key or build an out-of-band dashboard.

That is safe but frustrating. Developers will hit `query_limit_exceeded`, know
which field needs an index, but still be blocked.

**Required fix**

Introduce a constrained management scope/capability model for project owners.
This scope must be database/collection constrained and must not inherit full
server admin powers.

### P0.2 `read_write` Must Not Become A Management Superkey

**Evidence**

- `read_write` currently controls document mutation and transient publish.
- Management operations can trigger backfills, rebuilds, webhook side effects,
  schema enforcement, and structural changes.

**Why it matters**

If `read_write` is allowed to manage indexes or FTS, any leaked app key could
trigger expensive background work. Browser apps, mobile apps, and CI logs often
handle app keys in less-trusted places than server-side admin credentials.

**Required fix**

Do not add index/FTS/schema/webhook management to `read_write`. Add separate
capabilities and issue them only to trusted developer management contexts, such
as a dashboard session, backend service, CLI, or local self-hosted script.

### P0.3 Self-Service Index And FTS Builds Need A Job Model

**Evidence**

- `POST /{database}/{collection}/indexes` runs index creation/backfill in the
  request path.
- `POST /{database}/{collection}/fts` changes indexed fields and rebuilds FTS
  from existing documents.
- There is no public operation ID, progress endpoint, cancellation endpoint, or
  restart/resume story for developer-triggered management work.

**Why it matters**

Self-service developers need to know whether the build is queued, running,
ready, failed, or canceled. Synchronous builds are hard to use from dashboards,
CLIs, browsers, and serverless backends. Retrying an unclear request can also
duplicate load.

**Required fix**

Add a management operation/job model:

- return `202 Accepted` and `operation_id` for long-running builds;
- expose status/progress/error;
- enforce one active build per database/collection where needed;
- support cancellation or clear non-cancelable status;
- persist enough state for restart recovery;
- keep `ready` indexes separate from `building` indexes.

### P0.4 Developer Query Errors Are Not Actionable Enough

**Evidence**

- Audit 003 added `query_limit_exceeded` and operator diagnostics.
- Normal app developers receive a protective error but cannot directly tell
  whether the fix is smaller pages, a more selective filter, an index, an FTS
  change, or an operator budget change.

**Why it matters**

The safest system still feels broken if developers cannot recover. A developer
should not need to read operator-only headers or ask the host for every first
diagnosis.

**Required fix**

Add safe, scoped query advice:

- include a stable `reason` field where possible, such as
  `scan_docs_limit`, `scan_bytes_limit`, `response_bytes_limit`,
  `duration_limit`, or `fts_candidates_limit`;
- include safe client advice such as `lower_limit`, `narrow_filter`,
  `avoid_deep_offset`, or `request_index`;
- add a scoped `explain` or `query advisor` mode that does not expose
  cross-tenant information;
- recommend a candidate index when the query has an unindexed equality filter.

## P1 Findings

### P1.1 Discovery Endpoints Are Awkward For Narrow Scoped Keys

`GET /databases` and `GET /{database}/collections` can return `403` for narrow
tokens because the route does not contain all constraint parameters. This is
technically safe, but poor UX.

Add a scoped identity/metadata endpoint:

- `GET /api/v1/me`
- returns scope, database constraint, collection constraint, capabilities, and
  safe limits;
- returns only metadata the token is allowed to know.

Also consider making list endpoints return the allowed database/collection when
the token is narrow instead of returning `403`.

### P1.2 Index Metadata Is Too Thin For Self-Service

Current index listing returns field names. Developer self-service needs:

- field;
- state: `building`, `ready`, `failed`, `deleting`;
- progress if building;
- created time and created by;
- last error;
- approximate indexed document count;
- whether the index is currently used by query planning.

### P1.3 FTS Configuration Is Not Discoverable Enough

There is a `POST /fts` management endpoint, but developers also need a safe
read endpoint:

- `GET /{database}/{collection}/fts`
- returns configured fields, state, progress, and last error.

Without this, a developer can use `search=` but cannot easily understand why it
matches nothing.

### P1.4 Schema Self-Service Needs Dry Run And Compatibility UX

Schemas are useful for project owners, but changing a schema can immediately
break writes. Developer-safe schema management should include:

- validate schema format before saving;
- dry-run existing documents and report violation count/examples;
- support staged schema mode before enforcement;
- keep clear errors for app writes;
- record who changed the schema and when.

### P1.5 Webhook Self-Service Needs Safe Secrets And Test Delivery

Webhooks are natural developer-owned integrations, but they create outbound
network and secret-management risk.

Developer-safe webhook UX should include:

- keep SSRF protection enabled by default;
- keep max webhook count and per-target delivery limits;
- add `test webhook` endpoint;
- add secret rotation;
- expose delivery status only for owned database/collection;
- avoid returning the secret except when created or rotated.

### P1.6 Key Generation Is Too Coarse

The admin key can mint only `read_write` and `read_only` keys. A dashboard needs
to mint constrained management keys without granting full admin.

Add support for:

- capability claims;
- project/developer management scopes;
- shorter lifetimes for management tokens;
- token introspection for dashboards and CLIs;
- revocation by token owner or project admin within constraints.

### P1.7 Management Actions Need Audit Logs

When developers can manage indexes, FTS, schemas, or webhooks, hosts need to
know who changed what.

Add an audit log for management actions:

- actor token ID / subject;
- action;
- database and collection;
- request summary;
- status;
- created/finished timestamps;
- error details.

### P1.8 Terms Need A Product Glossary

The docs currently use app developer, host, operator, admin, dashboard backend,
and user. These terms need one clear glossary so permission docs do not confuse
people.

Recommended terms:

- **Host/operator**: person or service running JSONVault.
- **Project owner/developer**: person who owns one app/database.
- **App client**: frontend/mobile/backend code using document APIs.
- **Dashboard/backend**: trusted service that can issue or proxy management
  actions.
- **Root admin key**: server-wide credential that must never be exposed to apps.

## P2 Findings

### P2.1 Index Recommendations Should Be First-Class

Developers should not have to infer indexes from vague failures. Add query
advisor output that can say:

- `filter[status]` is unindexed;
- `status` is a candidate index;
- current result shape is too broad for offset pagination;
- sort is in memory;
- FTS term matched too many candidates.

### P2.2 Quotas And Plans Need Explicit Product Surfaces

Self-service management requires quotas:

- max indexes per collection;
- max concurrent builds per tenant;
- max FTS fields;
- max schema size;
- max webhooks per collection;
- max management operations per minute;
- optional plan-level limits.

The API should return clear `quota_exceeded` errors, not generic forbidden
errors.

### P2.3 Field Path Semantics Need Better UX

`ValidateFieldName` allows dots in field names, but docs should clearly explain
whether `profile.email` means a nested path or a literal key containing a dot.
Indexing and filtering need consistent behavior across documents, indexes, FTS,
and query examples.

### P2.4 SDKs And CLI Should Separate Runtime And Management

When SDKs exist, keep runtime clients and management clients separate:

- runtime client: document CRUD, query, SSE, transactions;
- management client: indexes, FTS, schemas, webhooks, operations.

This reduces the chance that app code accidentally ships management credentials.

## P3 Findings

### P3.1 Local Development Needs A Simple Story

Self-hosted developers should still have a direct, simple path:

- start JSONVault locally;
- use admin key only in local CLI/backend;
- create indexes and schemas from migration scripts;
- never embed admin or management keys in frontend code.

### P3.2 Documentation Should Include Role-Based Examples

Add examples for:

- hosted app client using `read_write`;
- project owner using a management token;
- host/operator using the root admin key;
- self-hosted developer running a local migration script.

## Non-Goals

- Do not expose `JSONVAULT_ADMIN_KEY` to browsers, mobile apps, or normal app
  clients.
- Do not make `read_write` powerful enough to perform expensive management
  operations.
- Do not raise query limits as the default fix for unindexed queries.
- Do not make user-triggered index/FTS builds invisible or unbounded.
- Do not hide operational risk behind developer-friendly wording.

## Recommended Implementation Order

1. Define the capability model and compatibility behavior for existing scopes.
2. Add scoped identity/metadata endpoint.
3. Add management authorization helpers and tests.
4. Add index self-service with quotas and operation status.
5. Add FTS status and safer management flow.
6. Add query advisor output for `query_limit_exceeded`.
7. Add schema and webhook self-service once audit logging and operation limits
   are in place.
8. Update docs and SDK/CLI guidance to separate runtime and management clients.

## Success Criteria

Audit 004 is successful when:

- a developer can safely manage indexes for their own database without the root
  admin key;
- a normal app `read_write` key still cannot trigger expensive management work;
- index/FTS builds are visible, bounded, and recoverable;
- `query_limit_exceeded` tells developers what to do next;
- hosts retain clear global controls and audit logs;
- docs clearly explain app client, project owner, dashboard/backend, and
  host/operator responsibilities.
