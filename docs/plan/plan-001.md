# Plan 001: Core-Backed JSONVault Dashboard Integration

Status: draft for user approval
Created: 2026-06-07
Updated: 2026-06-10
Target project: `jsonvault-ui`
Core source of truth: `jsonvault-core`
Reference docs:

- `docs/integration-guide.md`
- `docs/admin-guide.md`
- `docs/operator-guide.md`
- `jsonvault-ui/.env.example`
- `jsonvault-ui/dashboard-ui.json`

## Purpose

Move `jsonvault-ui` from mock-preview behavior toward a real self-hosted
dashboard that uses `jsonvault-core` like a normal trusted API client.

The dashboard should not invent a separate storage or auth model. It should use
Core REST APIs, Core Bearer tokens, Core database/collection/document behavior,
and Core capability rules. The operator hosts both Core and UI, generates the
dashboard API key from Core, and configures the UI with server-only environment
variables.

This supersedes the earlier mock-mode reliability plan in this file. Mock mode
can remain useful during development, but the product direction is now
Core-backed.

## Current Implementation Status

- Execution mode: page-by-page vertical slices.
- Current slice: indexes page Core-backed integration complete; awaiting
  feedback before search/FTS page.
- Last completed slice: indexes page lists, creates, and deletes
  collection-scoped Core secondary indexes through server actions and the
  selected project's server-only manager credential.
- Next slice after current: search/FTS page.
- Last verification: targeted Biome checks, `npx tsc --noEmit`, and
  `npm run build` on 2026-06-09; JSONVault UI dev server verified at
  `http://localhost:3000`; project deletion smoke-checked by rendering a Core
  project card delete affordance after adding typed-name confirmation, deleting
  a temporary Core `dashboard_projects` record, and verifying `404` after
  delete; `/dashboard` redesigned in a Supabase-style project overview and
  smoke-checked with a signed dashboard session selecting a temporary project
  and a server-minted project manager token, including selected-project render,
  primary database panel, get-connected section, project feature section,
  `Collections` labels instead of `Tables`, no unsupported `Framework`, `MCP`,
  `Advisor`, `Reports`, or `Total Requests` labels, no `Core request failed`,
  no `resource not found`, no locked collections action, and cleanup;
  `/dashboard/collections` smoke-checked with a signed dashboard session
  selecting a temporary project, a real Core collection, and one document,
  including collection render, document/API path columns, no empty state, no
  Core request failure text, and cleanup of the temporary collection and
  dashboard project record; `/dashboard/data` smoke-checked with a signed
  dashboard session selecting a temporary project, a real Core collection, and
  two real documents, including selected collection render, document/ETag
  columns, create action, pagination total, no empty state, no Core request
  failure text, and cleanup of the temporary collection and dashboard project
  record; empty-state/cursor feedback smoke-checked with an empty selected
  project on `/dashboard/collections` and `/dashboard/data`, including rendered
  empty states, divider-based table bodies, global enabled-button pointer
  cursor rule, no old row-border class, and cleanup of the temporary dashboard
  project record; `/dashboard/keys` smoke-checked with a signed dashboard
  session selecting a temporary project and real Core collection, including
  selected database render, collection scope option, read/write and read-only
  runtime key choices, one-time key warning, no fake key inventory, no
  project-admin key option, no Core request failure text, and cleanup of the
  temporary collection and dashboard project record; Core `POST /api/v1/admin/keys`
  verified with the selected project's manager token by minting a real
  `read_only` collection-scoped key; API keys feedback correction smoke-checked
  restored toolbar/table empty state/side-panel trigger on `/dashboard/keys`,
  including selected database render, collection option, no full-access key UI,
  no fake persisted key inventory text, no Core request failure text, and
  cleanup of the temporary collection and dashboard project record; API key
  metadata inventory smoke-checked with temporary dashboard project/key metadata
  records on `/dashboard/keys`, including stored five-character token prefix,
  token ID, scope, database, collection, no old Core inventory disclaimer, no
  full token in the rendered table, and cleanup of the temporary metadata,
  project, and collection records; `/dashboard/schemas` smoke-checked with a
  signed dashboard session selecting a temporary project, real Core collection,
  and active Core schema, including selected database render, collection render,
  saved schema badge, schema field/type render, validate/save actions, no mock
  store output, and cleanup of the temporary schema, collection, and dashboard
  project record; `/dashboard/indexes` smoke-checked with a signed dashboard
  session selecting a temporary project, real Core collection, and active Core
  secondary index, including selected database render, collection render, index
  field render, ready state badge, create action, collection search, no mock
  store output, no empty index state, and cleanup of the temporary index,
  collection, and dashboard project record.

Update this section after each completed slice so the current phase, completed
work, next page, and verification status remain visible.

## Implementation Scope

If this plan is fully implemented, `jsonvault-ui` should become a functional
dashboard backed by `jsonvault-core`.

Functional means:

- login, register, logout, and dashboard sessions work against Core-backed
  storage;
- dashboard users are stored as JSON documents in the configured dashboard auth
  database/collection;
- projects are real dashboard records that point to real Core databases;
- project creation creates or prepares the matching Core database path;
- project selection drives the existing dashboard pages;
- documents, collections, indexes, search, schemas, webhooks, operations,
  realtime, and API keys use real Core endpoints where Core supports them;
- UI actions are enabled or hidden based on `GET /api/v1/me` scope and
  capabilities;
- mock mode is no longer the default for the covered flows.

This is not a UI redesign plan. The existing dashboard UI, routes, layout,
visual style, and page structure should stay intact. Implementation work should
wire the current UI to real data and real server actions. UI changes are allowed
only when required for real data states, loading/error/empty states, permission
states, or to remove mock-only behavior.

## Vision

Self-hosted operator flow:

1. The operator runs `jsonvault-core`.
2. The operator configures Core with `JSONVAULT_ADMIN_KEY` and
   `JSONVAULT_JWT_SECRET`.
3. The operator generates a Core API key/JWT with curl or another trusted tool
   for the dashboard metadata database.
4. The operator puts that generated metadata key into `jsonvault-ui/.env` as
   `JSONVAULT_API_KEY`.
5. The operator configures `JSONVAULT_API_BASE_URL` to point to Core.
6. The UI `JSONVAULT_JWT_SECRET` must match Core's `JSONVAULT_JWT_SECRET` so
   the UI server can mint short-lived, server-only project manager tokens for
   selected project databases.
7. The UI server talks to Core with `Authorization: Bearer <token>`, using the
   metadata key for dashboard-owned records and server-minted project manager
   tokens for selected project database operations.
8. Browser code talks to the UI server, not directly to Core secrets.

The dashboard itself should store dashboard data in Core. For example,
dashboard auth users can live in:

- database: `JSONVAULT_DASHBOARD_AUTH_DATABASE`
- collection: `JSONVAULT_DASHBOARD_AUTH_COLLECTION`

Default template values currently point to:

```env
JSONVAULT_DASHBOARD_AUTH_DATABASE=jsonvault_dashboard
JSONVAULT_DASHBOARD_AUTH_COLLECTION=dashboard_users
```

Suggested dashboard-owned collections:

- `dashboard_users`: human dashboard accounts.
- `dashboard_projects`: dashboard project records, each pointing to a Core
  database name.
- `dashboard_api_keys`: non-secret generated key metadata, including token
  prefix, token ID, scope, database, collection, capabilities, and expiration.
- `dashboard_sessions` or signed HTTP-only cookies: dashboard session state.

Project records should not replace Core databases. A project record is dashboard
metadata. The user's actual JSON documents live in the Core database named by
that project record.

Core lazily creates databases and collections on first write when the token
allows the target path. If explicit database/collection creation is needed for a
flow, the UI server must call the matching Core management endpoint and respect
the current token capabilities.

## Environment Contract

### `jsonvault-core`

Core operator env:

- `JSONVAULT_ADMIN_KEY`: root server admin key. Server-side only.
- `JSONVAULT_JWT_SECRET`: HMAC secret used by Core to validate generated scoped
  JWT API keys. Must be long and random.
- storage, encryption, profile, timeout, backup, and resource-limit settings
  remain Core/operator concerns.

Core does not currently load `JSONVAULT_API_KEY` in its runtime config.

### `jsonvault-ui`

UI operator env:

- `JSONVAULT_API_BASE_URL`: base URL for the Core API, for example
  `http://localhost:5766`.
- `JSONVAULT_API_KEY`: operator-provided Core Bearer token used by the UI server
  for dashboard metadata records such as users and project records.
- `JSONVAULT_JWT_SECRET`: same value as Core. The UI server uses it to sign
  short-lived, server-only project manager JWTs for selected project database
  operations. It should not be used for browser-visible state.
- `JSONVAULT_DASHBOARD_SESSION_SECRET`: preferred UI-only secret for signing
  dashboard HTTP-only session cookies. Use a long random value separate from
  Core's JWT secret in production.
- `JSONVAULT_DASHBOARD_AUTH_DATABASE`: Core database for dashboard auth records.
- `JSONVAULT_DASHBOARD_AUTH_COLLECTION`: Core collection for dashboard auth
  records.
- `JSONVAULT_DASHBOARD_PROJECTS_DATABASE` and
  `JSONVAULT_DASHBOARD_PROJECTS_COLLECTION`: Core storage for dashboard project
  metadata records.
- `JSONVAULT_DASHBOARD_API_KEYS_DATABASE` and
  `JSONVAULT_DASHBOARD_API_KEYS_COLLECTION`: Core storage for dashboard-owned
  generated API key metadata. This stores redacted metadata only, never the
  full generated token.

None of these values should be exposed through `NEXT_PUBLIC_*`.

## Current State

Evidence from the current worktree:

- `jsonvault-ui/.env.example` declares `JSONVAULT_API_BASE_URL`,
  `JSONVAULT_JWT_SECRET`, `JSONVAULT_API_KEY`, and dashboard auth storage names.
- `jsonvault-ui/src/app/layout.tsx` still wraps the app in
  `DashboardMockProvider`.
- Several dashboard subpages still call `useDashboardMock()`. The foundation,
  login/register/logout, projects page, dashboard shell, and dashboard overview
  now consume real server-side Core/session/project state.
- `jsonvault-ui/src/lib/constants.ts` has `DASHBOARD_PREVIEW_MODE = true`.
- Core requires `JSONVAULT_ADMIN_KEY` and `JSONVAULT_JWT_SECRET`.
- Core accepts all runtime/API requests through `Authorization: Bearer <token>`
  except `/healthz`.
- Core `POST /api/v1/admin/keys` can mint `read_only`, `read_write`, and
  constrained `project_admin` keys.
- A token with `keys:manage` but without admin scope can mint only
  `read_only` and `read_write` runtime keys within its own constraints.

## Key Security Rules

- Keep `JSONVAULT_API_KEY`, `JSONVAULT_ADMIN_KEY`, and `JSONVAULT_JWT_SECRET`
  server-only.
- Browser-visible code must never import or read these env values.
- The UI should call Core from server routes, server actions, or server-only
  modules.
- Do not store Core secrets in `localStorage`.
- Do not put `project_admin` tokens in normal runtime app clients.
- Generated runtime keys should be shown once, then redacted.
- The UI must call `GET /api/v1/me` with the active server-side Core token and
  drive navigation/actions from scope and capabilities.

## Recommended Dashboard Key Permission

For the first Core-backed dashboard implementation, `JSONVAULT_API_KEY` should
be a generated, server-only `project_admin` JWT constrained to the dashboard's
own Core database:

```json
{
  "scope": "project_admin",
  "database": "jsonvault_dashboard",
  "collection": "*",
  "capabilities": [
    "metadata:read",
    "documents:read",
    "documents:write",
    "collections:manage"
  ]
}
```

Add `keys:manage` only when the dashboard server must mint `read_only` or
`read_write` runtime keys inside the same database constraint. Do not use
`read_write` for the dashboard backend because it cannot manage collections or
keys. Do not use the root `admin` key as the default dashboard credential
because it can control every database, backups, and key revocation; reserve it
for operator setup or an explicitly trusted full-admin server mode.

This makes `project_admin` the least-privilege default for the trusted dashboard
backend. It does not create one universal all-project credential: Core currently
rejects wildcard `project_admin` keys, so multi-project management needs
per-project `project_admin` credentials or a separate root-admin-backed operator
mode.

## Bootstrap API Key Flow

The operator can generate a dashboard bootstrap key with the Core admin key:

```bash
curl -X POST "$JSONVAULT_API_BASE_URL/api/v1/admin/keys" \
  -H "Authorization: Bearer $JSONVAULT_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "project_admin",
    "database": "jsonvault_dashboard",
    "collection": "*",
    "capabilities": [
      "metadata:read",
      "documents:read",
      "documents:write",
      "collections:manage"
    ]
  }'
```

The returned `token` becomes:

```env
JSONVAULT_API_KEY=<returned-token>
```

Compatibility gate: the running Core server must include the Audit 004
`project_admin` scope implementation. If Core returns
`{"error":"invalid scope, must be read_write or read_only"}`, the running server
is an older/stale executable. Rebuild and restart `jsonvault-core` before
continuing dashboard setup.

From `jsonvault-core`, build the package directory, not the single `main.go`
file:

```powershell
go build -o main.exe ./cmd/jsonvault
```

Do not use `go build .\cmd\jsonvault\main.go`; that compiles only `main.go` and
excludes sibling files such as `restore.go`, which defines `runRestore`.

If this UI deployment must issue app runtime keys for `jsonvault_dashboard`,
include `keys:manage` on this token. If it must issue runtime keys for user
project databases, use a `project_admin` token with `keys:manage` for that
specific project database instead of relying on the dashboard metadata token.

Important constraint: Core currently requires `project_admin` keys to be
constrained to one database. If the dashboard must manage many project
databases from one UI instance, we need one of these models:

- operator uses a root-admin-backed UI server for multi-project management;
- operator provisions one `project_admin` key per managed project/database;
- Core later adds a safer dashboard/operator token model for multi-database
  management.

This decision should be made before implementing multi-project real API wiring.

## Project API Key Generation Model

The dashboard metadata `JSONVAULT_API_KEY` should not be used to manage user
project databases or create user project runtime keys. It is only for
dashboard-owned metadata records.

Each dashboard project maps to one Core database. If the user opens that
project's API Keys page, generated app keys must be constrained to that
project's Core database only.

Example:

- User `user1` opens project `todo_list`. Any generated app key is constrained
  to `database: "todo_list"` and cannot control `dashboard`.
- User `user1` opens project `dashboard`. Any generated app key is constrained
  to `database: "dashboard"` and cannot control `todo_list`.

To support this, the UI server mints a short-lived, server-only project manager
JWT for the selected project database using `JSONVAULT_JWT_SECRET`:

```json
{
  "scope": "project_admin",
  "database": "todo_list",
  "collection": "*",
  "capabilities": [
    "metadata:read",
    "documents:read",
    "documents:write",
    "collections:manage",
    "keys:manage"
  ]
}
```

The project manager token must never be sent to browser code. The UI server
must verify the authenticated dashboard user can administer the selected
project, force every Core request database to that project database, and allow
only `read_only` or `read_write` runtime key creation for external app clients.
Core also enforces this: non-admin tokens with `keys:manage` can mint only
`read_only` or `read_write` keys inside their own database/collection
constraints.

Project creation does not require the user to supply an API key. Creating a
project stores dashboard metadata and establishes the Core database name. The UI
server can then mint short-lived project manager tokens for that database for
dashboard-internal management workflows.

## Architecture Target

### Server-only Core client

Create a focused Core client layer, for example:

- `src/lib/core/config.ts`
- `src/lib/core/client.ts`
- `src/lib/core/errors.ts`
- `src/lib/core/types.ts`

Responsibilities:

- validate server env at startup/request boundary;
- normalize `JSONVAULT_API_BASE_URL`;
- attach the correct server-only Bearer token: `JSONVAULT_API_KEY` for
  dashboard metadata records, or a short-lived project manager JWT for selected
  project database operations;
- send `Content-Type: application/json` for writes;
- preserve ETag headers;
- parse pagination headers;
- parse Core error bodies consistently;
- expose typed methods for Core endpoints.

Do not spread raw `fetch()` calls across pages.

### UI server boundary

Browser components should call UI-owned route handlers or server actions. Those
server boundaries call Core using the server-only Core client.

This keeps the operator-provided `JSONVAULT_API_KEY`, project manager JWTs, and
`JSONVAULT_JWT_SECRET` out of the browser while still letting dashboard users
manage selected projects through the UI server.

### Dashboard auth storage

Dashboard login/register should eventually use Core documents in the configured
auth database and collection.

Suggested document model:

```json
{
  "email": "user@example.com",
  "password_hash": "...",
  "created_at": "2026-06-09T00:00:00Z",
  "updated_at": "2026-06-09T00:00:00Z",
  "role": "operator"
}
```

Rules:

- password hashing happens only on the UI server;
- raw passwords are never stored;
- dashboard session cookies are HTTP-only;
- dashboard sessions are separate from Core API keys unless deliberately
  designed otherwise;
- if `JSONVAULT_JWT_SECRET` is used by the UI, keep claims clear and avoid
  accidentally sending dashboard-session JWTs to Core as API keys.

### Capability-driven dashboard

After the UI server authenticates to Core, it should call:

```http
GET /api/v1/me
Authorization: Bearer <JSONVAULT_API_KEY>
```

This endpoint does not log a user in and does not create data. It inspects the
Bearer token already being used. Core returns the token's scope, database
constraint, collection constraint, token ID, and capabilities.

`/api/v1/me` is a `jsonvault-core` endpoint, registered by Core's HTTP API and
implemented by Core's identity handler. The UI should call it; the UI should not
reimplement its authorization logic.

The response controls:

- visible sidebar sections;
- enabled create/edit/delete actions;
- API Keys page scope options;
- management pages such as Indexes, Search, Schemas, Webhooks, Operations.

Example response:

```json
{
  "scope": "project_admin",
  "database": "jsonvault_dashboard",
  "collection": "*",
  "token_id": "1f6d2d2b8c9a4e0d9f1b2c3a4d5e6f70",
  "capabilities": [
    "metadata:read",
    "documents:read",
    "documents:write",
    "collections:manage"
  ]
}
```

## Implementation Plan

### Execution Mode: Vertical Slices

Implement this plan one page/workflow at a time. Do not wire every dashboard
area in one broad pass.

Each slice should include:

- the server-only Core client methods needed by that slice;
- the UI server route handlers or server actions needed by that slice;
- page wiring to real data;
- loading, empty, error, and permission-denied states for that slice;
- targeted tests or checks for changed modules;
- a manual test against local `jsonvault-core` when the slice touches real Core
  behavior;
- user feedback before moving to the next slice.

Shared foundation work is allowed only when it unblocks the next page slice. The
foundation should stay thin and grow as each page needs real Core behavior.

### Page Slice Order

- [x] **Foundation gate**: env validation, server-only Core client shell,
      `GET /api/v1/me`, and dashboard session primitives.
- [x] **Login page**: authenticate dashboard users from Core-backed dashboard
      auth storage and create an HTTP-only dashboard session.
- [x] **Register page**: create dashboard users in Core-backed dashboard auth
      storage with server-side password hashing.
- [x] **Logout/session guard**: protect dashboard routes and clear sessions.
- [x] **Projects page**: create/list/select/delete project records and prepare
      the mapped Core database path.
- [x] **Dashboard overview**: replace mock overview data with selected-project
      Core state and JSONVault-only capability labels.
- [x] **Collections page**: list/create/delete collections for the selected
      project database.
- [x] **Documents page**: list/read/create/edit/delete documents for the
      selected collection.
- [x] **API Keys page**: generate project-scoped `read_only` and `read_write`
      app keys using the selected project's server-only manager credential.
- [x] **Schemas page**: manage schemas for the selected collection.
- [x] **Indexes page**: manage indexes for the selected collection.
- [x] **Search page**: manage FTS fields and test search for the selected
      collection.
- [ ] **Webhooks page**: manage collection webhook targets and delivery states.
- [ ] **Operations page**: list/cancel permitted Core operations.
- [ ] **Realtime page**: connect to real SSE/presence/publish behavior through a
      safe auth boundary.
- [ ] **Docs and cleanup**: env examples, setup docs, mock-mode cleanup, and
      final full-flow verification.

The detailed checklists below remain the responsibility map, but execution
follows the page slice order above.

### Phase 0: Confirm Token Model

- [x] Approve the default `JSONVAULT_API_KEY` model: server-only
      `project_admin` constrained to the dashboard metadata database.
- [x] Decide whether multi-project management uses one `project_admin` token per
      project database or a separate root-admin-backed operator mode.
- [x] Decide exactly when UI needs `JSONVAULT_JWT_SECRET`; dashboard sessions
      should use `JSONVAULT_DASHBOARD_SESSION_SECRET`, while offline Core JWT
      signing still needs Core's JWT secret.
- [x] Decide whether real multi-project management is in the first real API
      pass or a later operator/admin pass.
- [x] Update `jsonvault-ui/.env.example` comments after the decisions are
      approved.

### Phase 1: Core Client Foundation

- [x] Add server-only env validation for `JSONVAULT_API_BASE_URL` and
      `JSONVAULT_API_KEY`.
- [x] Add a server-only Core HTTP client.
- [x] Add typed Core error parsing.
- [x] Add typed helper for `GET /api/v1/me`.
- [x] Add typed helper for filtered document list reads.
- [x] Add typed helper for document creation.
- [x] Add typed helpers for collections, document updates/deletes, schemas,
      indexes, and admin key creation where permitted.
- [ ] Add typed helpers for databases, FTS, webhooks, and operations.
- [ ] Add tests for URL joining, auth headers, JSON serialization, ETag
      extraction, pagination headers, and Core error parsing.

### Phase 2: Dashboard Server API Boundary

- [ ] Add UI route handlers/server actions that call the Core client.
- [ ] Keep all Core secrets inside server-only modules.
- [ ] Return sanitized data to browser components.
- [ ] Map Core `401`, `403`, `404`, `409`, `412`, `422`, and `429` into
      dashboard-safe error messages.
- [ ] Add cache/no-store behavior where data must be fresh.

### Phase 3: Dashboard Auth On Core

- [x] Add signed HTTP-only dashboard session cookie primitives.
- [x] Implement register against the configured Core auth database/collection.
- [x] Implement login against that same Core collection.
- [x] Hash passwords server-side.
- [x] Store dashboard session in an HTTP-only cookie.
- [x] Add logout.
- [ ] Keep login/register free of root admin key, JWT secret, and server setup
      prompts.

### Phase 4: Projects On Core

- [x] Store dashboard project records in the dashboard-owned Core database,
      likely `dashboard_projects`.
- [x] Each project record should include a display name, Core database name,
      owner/user link, created timestamp, and status.
- [x] Use a server-only project manager credential for selected project
      operations, minted on demand from `JSONVAULT_JWT_SECRET`.
- [x] Creating a project should create the dashboard project record and prepare
      the matching Core database path.
- [x] Project creation must not require users to provide an API key; dashboard
      project management uses the UI server's on-demand project manager token.
- [x] Prefer Core lazy creation where it is enough; use explicit Core
      database/collection endpoints only when the token has the required
      capability and the workflow needs explicit provisioning.
- [ ] Selecting a project should set the active Core database for the existing
      dashboard pages.
- [x] Keep the existing Projects page UI; only replace mock data/actions with
      real server-backed data/actions.

### Phase 5: Replace Mock Store Incrementally

- [ ] Keep the mock store only behind an explicit preview/development mode.
- [ ] Build a real data adapter with a similar shape to the current dashboard
      store so pages can migrate incrementally.
- [ ] Start with low-risk reads:
      `GET /api/v1/me`,
      `GET /api/v1/databases`,
      `GET /api/v1/{database}/collections`.
- [ ] Then wire document list/read/create/edit/delete.
- [ ] Then wire collection create/delete.
- [ ] Then wire Indexes, Search, Schemas, Webhooks, Operations, Realtime, and
      API Keys.

### Phase 6: API Keys Page

- [x] Use Core `POST /api/v1/admin/keys` through the UI server boundary.
- [x] For project API key creation, use the selected project's server-only
      project manager credential, not the dashboard metadata `JSONVAULT_API_KEY`.
- [x] Force generated key requests to the active project's Core database.
- [x] If caller has `keys:manage` but not admin, allow only `read_only` and
      `read_write` keys within caller constraints.
- [x] Disable key generation when the UI server cannot mint a selected-project
      manager token with `keys:manage`.
- [x] Hide or disable `project_admin` creation unless the UI server is in an
      approved root-admin/operator context.
- [x] Show generated token once with copy action.
- [x] Store/display token ID, scope, database, collection, capabilities, and
      expiration without keeping the full token visible.
- [ ] Do not show `JSONVAULT_JWT_SECRET`.

### Phase 7: Realtime

- [ ] Use a fetch-based SSE client or UI server proxy because native
      `EventSource` cannot set `Authorization` headers.
- [ ] Never put Bearer tokens in query strings.
- [ ] Support `Last-Event-ID` or `last_event_id` replay.
- [ ] Show real connection state only when an actual stream is open.

### Phase 8: Docs And Operator UX

- [x] Update `jsonvault-ui/.env.example` with comments explaining each env var.
- [ ] Add a UI setup doc with the operator curl flow.
- [ ] Document which capabilities are required for each dashboard section.
- [ ] Document the limitation around one-database `project_admin` tokens.
- [ ] Keep `docs/integration-guide.md` focused on app developers, not server
      env setup.

### Phase 9: Verification

- [ ] For every page slice, run the smallest relevant automated checks before
      moving on.
- [ ] For every page slice that calls Core, manually test against a local
      `jsonvault-core` instance.
- [ ] Collect user feedback after each completed slice before implementing the
      next slice.
- [ ] Run relevant unit tests for the Core client.
- [ ] Run `npm run build`.
- [ ] Run targeted Biome checks for touched files.
- [ ] Test with a local `jsonvault-core` instance.
- [ ] Verify secrets are absent from client bundles and browser responses.
- [ ] Verify login/register/dashboard requests use UI server routes, not
      browser-exposed Core secrets.
- [ ] Verify permission-denied states from real `GET /api/v1/me` capabilities.

## Non-Goals For The First Core-Backed Pass

- Do not build billing, organizations, teams, invitations, or hosted SaaS
  multi-tenancy.
- Do not expose Core root admin key to browser code.
- Do not implement unsupported Core features as fake live controls.
- Do not remove all mock functionality until real adapters cover the relevant
  flows.
- Do not use `NEXT_PUBLIC_JSONVAULT_API_KEY` or any equivalent browser-visible
  secret.

## Open Alignment Questions

- Should production require `JSONVAULT_DASHBOARD_SESSION_SECRET` with no
  fallback to `JSONVAULT_JWT_SECRET`?
- Should mock mode stay available as an explicit preview mode after real Core
  integration starts?
