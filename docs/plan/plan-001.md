# Plan 001: JSONVault Dashboard Mock-Mode Reliability Pass

Status: draft for user approval
Created: 2026-06-07
Target project: `jsonvault-ui`
Reference guide: `jsonvault-ui/dashboard-ui.json`

## Purpose

Make the dashboard feel production-grade even while it is still running in mock mode.

The goal is not to wire every screen to `jsonvault-core` yet. The goal is to make each screen work end-to-end from a user's point of view, with realistic JSONVault behavior, safe copy, no fake technical clutter, and page flows that match what `jsonvault-core` actually supports.

## Main Decisions To Approve

- Use a shared mock dashboard data layer instead of separate hard-coded arrays on every page.
- Let mock actions mutate local UI state so buttons visibly work during testing.
- Persist mock state in browser local storage so refreshes do not immediately reset the flow.
- Keep the UI easy for normal users, but keep core details such as ETags, operation IDs, capabilities, and API routes available in quieter "details" or "advanced" areas.
- Treat schemas, indexes, FTS, webhooks, documents, and realtime as collection-scoped features because `jsonvault-core` models them under `/{database}/{collection}`.
- Use user-facing words first, with exact technical names only where they help debugging or integration.
- Do not use gradients, decorative blobs, hero marketing layouts, or fake analytics.

## Non-Goals

- Do not build real user account auth in this pass.
- Do not connect every page to live `jsonvault-core` APIs in this pass.
- Do not add billing, teams, invitations, restore upload, or unsupported server settings.
- Do not expose `JSONVAULT_ADMIN_KEY` or `JSONVAULT_JWT_SECRET` to normal dashboard users.

## Current Problems Found

- Many pages use page-local constants such as `MOCK_DOCS`, `MOCK_COLLECTIONS`, `MOCK_INDEXES`, and `MOCK_OPS`, so actions on one page do not affect related pages.
- Some primary buttons do nothing in mock mode, including create document, save schema, save webhook target, create index, save FTS config, revoke key, retry delivery, cancel operation, and create project.
- The document edit modal shows technical copy too loudly: `This document is protected against concurrent edits. Version: "..."`
- Schemas are presented like one global editor, but core schema endpoints are per database and collection.
- Indexes, FTS, webhooks, realtime, and documents also need a consistent selected collection context.
- Some mock messages say "not connected yet" even when the user wants a fully testable mock flow.
- Mock dashboard stats can drift from the actual mock page data.
- Realtime has simulated connection behavior, but it should be clearly realistic and should not claim a real server stream is open unless connected later.
- Technical details such as capabilities, ETags, operation IDs, and endpoint routes are useful, but should be shown as secondary details rather than blocking alerts.
- Some accessibility and lint issues remain around labels, static click handlers, dropdown behavior, and modal semantics.

## Core Alignment Rules

| Area | Core behavior to match | Dashboard mock behavior |
| --- | --- | --- |
| Documents | `GET/POST/PUT/PATCH/DELETE /api/v1/{database}/{collection}` | Create, edit, delete, filter, paginate, and select documents in the selected collection. |
| ETags | Used for safe concurrent updates | Hide raw ETag from primary copy; show "change protection" and expose ETag in document details. |
| Collections | `GET/POST/DELETE /api/v1/{database}/collections` | Create/delete collections; deleting a collection removes related mock docs, indexes, schema, FTS, and webhooks. |
| Indexes | `GET/POST/DELETE /api/v1/{database}/{collection}/indexes` | Manage indexes per selected collection; async create creates a mock operation. |
| FTS | `GET/POST /api/v1/{database}/{collection}/fts` | Manage searchable fields per selected collection; saving creates a mock rebuild operation. Saving an empty field list is not supported by the current core handler. |
| Schemas | `GET /schema`, `POST /schema/validate`, `PUT /schema`, `DELETE /schema` under `/{database}/{collection}` | Select a collection, edit that collection schema, validate schema format, save, and delete. |
| Webhooks | `GET/PUT /api/v1/{database}/{collection}/webhooks` | Manage targets per selected collection; show one-time mock secret on save. |
| Deliveries | `GET /api/v1/admin/webhooks/{database}/deliveries`, `POST /api/v1/admin/webhooks/{database}/deliveries/{sequence}/retry` | Show realistic database-level delivery records and allow failed deliveries to retry in mock state; filter by selected collection in the UI when useful. |
| Operations | `GET /api/v1/operations`, cancel where permitted | Show operations from mock actions; cancel running operations. |
| API keys | `POST /api/v1/admin/keys`, `DELETE /api/v1/admin/keys/{jti}` | Generate mock read-only/read-write app keys in the API Keys page. Project owner keys and revocation are admin/operator flows in core. |
| Realtime | SSE subscribe, presence, transient publish | Simulate start/stop, presence count, document events, publish events, and replay explanation. |
| Admin | Root admin only | Keep platform actions isolated and clearly operator-only. |

## Verified Core Findings

- Schemas are per collection, not global. The route includes both database and collection: `/api/v1/{database}/{collection}/schema`.
- A schema can be read by tokens with `metadata:read` or document read access for that resource.
- Schema validation and mutation require `schemas:manage`.
- `POST /api/v1/{database}/{collection}/schema/validate` validates the schema document itself. It does not validate an example document against a schema.
- `PUT /api/v1/{database}/{collection}/schema` stores a valid JSON Schema and compresses it to normalized JSON.
- `DELETE /api/v1/{database}/{collection}/schema` removes only that collection's schema.
- `SetSchema` requires the collection bucket to already exist. The dashboard should create/select a collection before saving a schema for it.
- Stored schemas are enforced on document create, put, patch, transaction put, and transaction patch.
- Existing documents are not retroactively rejected when a schema is saved.
- Deleting a collection removes its schema, index metadata, FTS config, webhooks, TTL metadata, and collection count.
- FTS config is collection-scoped and currently uses `POST /api/v1/{database}/{collection}/fts` to save fields.
- The FTS handler rejects an empty `fields` array, so "clear all FTS fields" is not a supported save action unless core adds a delete/clear endpoint.
- Webhook targets are collection-scoped, but webhook delivery inspection is database-level and each delivery embeds the event collection.
- Project users with `keys:manage` can mint only `read_only` and `read_write` runtime keys within their token constraints. Only admin can mint `project_admin` keys or revoke keys through the current API.

## Implementation Plan

### Phase 0: Shared Mock Foundation

- [ ] Create a shared mock data module, likely `src/lib/mock-dashboard-store.ts`.
- [ ] Model data by database and collection:
  - databases/projects;
  - collections;
  - documents;
  - indexes;
  - FTS fields;
  - schemas;
  - webhooks;
  - deliveries;
  - operations;
  - API keys;
  - realtime events.
- [ ] Add mock helpers for core-like behavior:
  - generate document IDs;
  - generate ETag-like versions;
  - create/update/delete documents;
  - create/delete collections with cascading mock cleanup;
  - create index and optional background operation;
  - save non-empty FTS fields and optional rebuild operation;
  - save/delete per-collection schema;
  - save/remove webhooks and return a one-time secret;
  - retry failed webhook deliveries;
  - generate runtime API keys and handle admin-only key revocation separately;
  - start/cancel operations;
  - append realtime events.
- [ ] Persist mock state to `localStorage` under one namespaced key such as `jsonvault-ui:mock-state`.
- [ ] Add a reset mock data action for development/testing.
- [ ] Keep all mock data clearly client-local without telling users data was saved to the real server.

### Phase 1: App Shell And Context

- [ ] Update `src/app/dashboard/layout.tsx` so database and collection context can be shared across dashboard pages.
- [ ] Make Topbar selectors actually change selected database and collection in mock state.
- [ ] Show collection selector on collection-scoped pages:
  - Documents;
  - Indexes;
  - Full-Text Search;
  - Schemas;
  - Webhooks;
  - Realtime.
- [ ] Keep Sidebar visibility capability-aware, but make labels user-facing:
  - Documents;
  - Collections;
  - Indexes;
  - Search;
  - Schemas;
  - Webhooks;
  - Operations;
  - API Keys;
  - Realtime;
  - Admin.
- [ ] Replace hard-coded dashboard values with selected mock project context.

### Phase 2: User-Facing Copy Cleanup

- [ ] Remove loud technical alerts from primary workflows.
- [ ] Replace the document edit alert with user-facing copy such as:
  - "This document has change protection. If someone else edits it first, JSONVault will ask you to refresh before saving."
- [ ] Move raw ETag display to document details under a quieter label such as "Version token" or "Advanced details".
- [ ] Avoid showing raw capability names in primary descriptions when possible; keep them in tooltips/details.
- [ ] Remove "not connected yet" messages from mock-mode workflows.
- [ ] Use "Saved locally for preview" or "Mock preview updated" only where the user needs clarity.
- [ ] Keep exact API names available in secondary integration details.

### Phase 3: Auth And Connection Screens

- [ ] Login should validate fields and then enter mock dashboard mode instead of ending in an error.
- [ ] Register should validate fields and then continue to project setup or dashboard mock mode.
- [ ] Connect Server should keep the real `/healthz` test, but save mock connection context after success.
- [ ] Root admin key input should remain operator-only, masked, and never displayed after save.
- [ ] Add user-facing success states for sign-in, registration, and connection.

### Phase 4: Overview

- [ ] Drive stats from shared mock state.
- [ ] Keep numbers realistic and consistent with page data.
- [ ] Recent operations should read from the mock operations list.
- [ ] Quick actions should use labels that match dashboard pages.
- [ ] Current access should be available, but not dominate the page with technical capability badges.
- [ ] Add helpful empty state for a new project with no collections/documents.

### Phase 5: Documents Page

- [ ] Use documents from the selected database and collection.
- [ ] Make "Create document" open a JSON editor and add a mock document.
- [ ] Make edit save update the mock document, generate a new ETag, and close the modal.
- [ ] Make delete remove the mock document.
- [ ] Make refresh reload current mock state.
- [ ] Keep search, pagination, and row selection stable.
- [ ] Add optional filter/sort controls only if they can work in mock mode.
- [ ] Replace `JSON Body` with a friendlier label such as `Document JSON`.
- [ ] Move ETag to advanced details and use user-facing change-protection text.
- [ ] Keep copy buttons for document ID and version token.

### Phase 6: Collections Page

- [ ] Use collections from the selected database.
- [ ] Make "New collection" add a mock collection.
- [ ] Validate collection names using core-compatible rules.
- [ ] Make delete cascade related mock docs, indexes, schema, FTS config, webhooks, deliveries, and operations.
- [ ] Add links/actions from each collection row:
  - view documents;
  - manage schema;
  - manage indexes;
  - manage search;
  - manage webhooks.
- [ ] Use typed confirmation for destructive collection delete.

### Phase 7: Indexes Page

- [ ] Scope the page to selected collection.
- [ ] Make create index add an index to that collection.
- [ ] If "Build in the background" is selected, create a mock running operation and set index state to building.
- [ ] Provide a small control to complete/fail background mock operations for testing, or auto-complete after a short delay.
- [ ] Make delete index remove it from mock state.
- [ ] Keep guidance simple: "Indexes make repeated filters faster."
- [ ] Show operation link only when an operation exists.

### Phase 8: Search / FTS Page

- [ ] Scope FTS fields to selected collection.
- [ ] Add/remove fields locally before save.
- [ ] Save configuration into mock state with core-compatible `POST /fts` behavior and create a mock `fts.configure` operation.
- [ ] Prevent saving an empty field list because the current core handler rejects it.
- [ ] If all fields are removed, show a user-facing message that at least one searchable field is required to save search configuration.
- [ ] Make "Test Search" return mock document matches from configured fields.
- [ ] Show a clear empty state when no fields are configured.
- [ ] Avoid implying search works across fields that are not configured.

### Phase 9: Schemas Page

- [ ] Add selected collection context at the top of the page.
- [ ] Show and edit the schema for only that collection.
- [ ] Let users switch collections and see different schemas.
- [ ] Only allow saving a schema for an existing collection.
- [ ] If the user wants a schema for a missing collection, guide them to create the collection first.
- [ ] Match core response behavior: no schema means `schema: null`.
- [ ] Add a Validate schema action that matches `POST /schema/validate` and checks schema format.
- [ ] Save schema into mock state.
- [ ] Delete schema only for the selected collection.
- [ ] Validate JSON syntax immediately.
- [ ] Recommended: add `ajv` for accurate Draft-07 schema validation in mock mode.
- [ ] If not adding `ajv`, perform basic schema-shape validation and clearly label it as syntax/basic validation.
- [ ] Add a test document panel only as a dashboard mock/client helper. Core does not currently expose a document dry-run validation endpoint.
- [ ] Make mock create/edit document flows enforce the saved schema so the user can see realistic validation failures.
- [ ] Use user-facing copy:
  - "This schema checks new and edited documents in this collection."
  - "Existing documents are not changed."
- [ ] Keep technical API details in a collapsed or secondary area.

### Phase 10: Webhooks Page

- [ ] Scope webhook targets to selected collection.
- [ ] Make Add target validate public HTTPS-looking URLs in mock mode.
- [ ] Support core event choices: insert, update, delete, publish, and optionally all events.
- [ ] Save target into mock state.
- [ ] Show a one-time mock webhook secret after save with copy action.
- [ ] Remove target from mock state.
- [ ] Show deliveries from the selected database and optionally filter/display the embedded event collection.
- [ ] Do not imply the delivery endpoint itself is collection-scoped; core delivery inspection is database-level.
- [ ] Make Retry update failed delivery status through pending to delivered or failed.
- [ ] Keep SSRF warning user-facing:
  - "Use a public HTTPS endpoint. Local and private network addresses are blocked."
- [ ] Fix unused imports and accessibility labels while editing.

### Phase 11: Operations Page

- [ ] Read operations from shared mock state.
- [ ] Show operation details in a drawer or modal.
- [ ] Make Cancel update running operations to canceling/canceled.
- [ ] Show last error text in details, not only a vague "Error" label.
- [ ] Add filters for state/type if simple enough.
- [ ] Explain operation history is temporary only in secondary helper text.

### Phase 12: API Keys Page

- [ ] Make Generate key create a mock key record.
- [ ] Show a generated mock token once in a modal with copy action.
- [ ] Keep read-only and read/write app keys user-facing.
- [ ] Do not let project users mint project owner keys from this page because core blocks non-admin `project_admin` key creation.
- [ ] If the current context is root admin, route project owner key creation to Admin/operator UI.
- [ ] Revoke should be disabled or routed to Admin/operator mode because core revocation is admin-only.
- [ ] Add expiry selection if it can be mocked cleanly.
- [ ] Keep raw capability list in advanced details.
- [ ] Do not show `JSONVAULT_JWT_SECRET`.

### Phase 13: Realtime Page

- [ ] Scope realtime to selected collection.
- [ ] Rename internal functions from `mockConnect`/`mockPublish` to user-neutral names.
- [ ] Start listening should open a simulated stream state and append a connected event.
- [ ] Stop listening should close the simulated stream state.
- [ ] Publish should validate JSON and append a transient event only when listening.
- [ ] Document create/edit/delete actions elsewhere should append realtime events when listening.
- [ ] Presence should reflect simulated listeners.
- [ ] Make copy clear:
  - "Live updates show what your app would receive."
  - "Temporary events are not saved for replay."
- [ ] Keep browser auth note out of primary UI unless an integration details panel exists.

### Phase 14: Admin Page

- [ ] Keep Admin visible only for root admin mode.
- [ ] Drive project/database list from shared mock state.
- [ ] Make New project create a mock database/project.
- [ ] Add delete project with typed confirmation if included.
- [ ] Make Create owner key show a copy-once mock project owner token.
- [ ] Keep health/metrics copy realistic:
  - health can be mocked;
  - metrics are admin-only;
  - backup is admin-only if added.
- [ ] Avoid hard-coded fake uptime/version unless presented as mock status.

### Phase 15: Shared Components And Accessibility

- [ ] Tighten `Modal` semantics with `role="dialog"`, `aria-modal`, and labelled title.
- [ ] Replace static clickable wrapper elements in dropdown/modal internals with accessible controls where possible.
- [ ] Give all textareas and inputs labels or `aria-label`.
- [ ] Ensure icon-only buttons have `aria-label` and `title` or tooltip.
- [ ] Remove manual inline SVG close icon where lucide `X` can be used.
- [ ] Replace `any` button props with typed component props.
- [ ] Ensure keyboard focus states are visible.
- [ ] Ensure text does not overflow in buttons, badges, and tables.

### Phase 16: Verification

- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Manually test top-to-bottom dashboard flows:
  - login/register/connect mock flow;
  - overview stats update;
  - create/edit/delete document;
  - create/delete collection;
  - create/delete index;
  - configure FTS and test search;
  - save/delete per-collection schema;
  - add/remove webhook and retry delivery;
  - cancel operation;
  - generate app API key;
  - create project owner key in Admin/operator mode;
  - start/stop realtime and publish event;
  - admin create project and owner key.
- [ ] Check mobile-ish viewport for no text overlap.
- [ ] Check dark and light themes.
- [ ] Confirm no visible gradients, decorative blobs, or marketing hero sections were added.

## Proposed Implementation Order After Approval

1. Build the shared mock store and dashboard context.
2. Fix shell/topbar/sidebar context and copy.
3. Fix Documents and Collections first because they feed the rest of the dashboard.
4. Fix collection-scoped management pages: Indexes, Search, Schemas, Webhooks.
5. Fix Operations, API Keys, Realtime, and Admin.
6. Run lint/build and a manual UI flow pass.
7. Collect feedback before moving to real API wiring.

## Approval Questions

- Should mock state persist in `localStorage`, or reset on every browser refresh?
- Should I add `ajv` so the schema page can validate Draft-07 schemas and test documents accurately?
- Should the dashboard show API endpoint details by default, or hide them behind "Integration details" sections?
- Do you approve keeping project owner key creation in Admin/operator mode only, to match current core behavior?
