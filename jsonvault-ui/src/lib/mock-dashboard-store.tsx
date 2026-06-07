"use client";

import Ajv, { type AnySchema } from "ajv";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Capability, Scope } from "./types";

const STORAGE_KEY = "jsonvault-ui:dashboard-state:v2";
const LEGACY_STORAGE_KEYS = ["jsonvault-ui:mock-state:v1"];
const MOCK_ACTOR = "project-owner";

export type OperationState =
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "canceling"
  | "canceled";

export interface MockDocument {
  id: string;
  etag: string;
  document: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MockIndex {
  field: string;
  state: "ready" | "building" | "failed";
  operation_id?: string;
}

export interface MockWebhookTarget {
  url: string;
  events: string[];
}

export interface MockDelivery {
  sequence: number;
  event: {
    action: string;
    database: string;
    collection: string;
    document_id?: string;
  };
  status: "pending" | "delivering" | "delivered" | "failed";
  attempts: number;
  last_error?: string;
  updated_at: string;
}

export interface MockOperation {
  operation_id: string;
  type: string;
  database: string;
  collection?: string;
  field?: string;
  state: OperationState;
  progress: number;
  actor: string;
  created_at: string;
  updated_at: string;
  last_error?: string;
  cancellable: boolean;
}

export interface MockApiKey {
  jti: string;
  token?: string;
  scope: Exclude<Scope, "admin">;
  database: string;
  collection: string;
  capabilities: Capability[];
  expires_at: string;
  revoked?: boolean;
}

export interface MockRealtimeEvent {
  id: number;
  sequence?: number;
  type: string;
  database: string;
  collection: string;
  data: string;
  ts: string;
}

export interface MockCollection {
  name: string;
  documents: MockDocument[];
  indexes: MockIndex[];
  ftsFields: string[];
  schema: string | null;
  webhooks: MockWebhookTarget[];
}

export interface MockDatabase {
  name: string;
  displayName?: string;
  status: "active";
  created_at: string;
  collections: Record<string, MockCollection>;
}

export interface MockState {
  apiBaseUrl: string;
  selectedDb: string;
  selectedCollection: string;
  me: {
    scope: Scope;
    database: string;
    collection: string;
    jti: string;
    capabilities: Capability[];
  };
  databases: Record<string, MockDatabase>;
  operations: MockOperation[];
  deliveries: MockDelivery[];
  keys: MockApiKey[];
  realtime: {
    connected: boolean;
    collection: string;
    presence: number;
    events: MockRealtimeEvent[];
    nextSequence: number;
  };
}

interface ActionResult<T = undefined> {
  ok: boolean;
  message: string;
  data?: T;
}

interface DashboardMockContextValue {
  state: MockState;
  selectedDatabase: MockDatabase;
  selectedCollection: MockCollection;
  collections: MockCollection[];
  setSelectedDb: (database: string) => void;
  setSelectedCollection: (collection: string) => void;
  resetMockState: () => void;
  createProject: (displayName: string, databaseId?: string) => ActionResult;
  createCollection: (name: string) => ActionResult;
  deleteCollection: (name: string) => ActionResult;
  createDocument: (body: string) => ActionResult<MockDocument>;
  updateDocument: (id: string, body: string) => ActionResult<MockDocument>;
  deleteDocument: (id: string) => ActionResult;
  createIndex: (field: string, asyncBuild: boolean) => ActionResult<MockIndex>;
  deleteIndex: (field: string) => ActionResult;
  saveFTSFields: (fields: string[]) => ActionResult;
  saveSchema: (schema: string) => ActionResult;
  deleteSchema: () => ActionResult;
  validateSchemaText: (schema: string) => ActionResult;
  validateDocumentAgainstSchema: (documentText: string) => ActionResult;
  saveWebhookTarget: (
    url: string,
    events: string[],
  ) => ActionResult<{ secret: string }>;
  removeWebhookTarget: (url: string) => ActionResult;
  retryDelivery: (sequence: number) => ActionResult;
  cancelOperation: (operationId: string) => ActionResult;
  generateRuntimeKey: (
    scope: "read_only" | "read_write",
    database: string,
    collection: string,
  ) => ActionResult<MockApiKey>;
  generateProjectOwnerKey: (database: string) => ActionResult<MockApiKey>;
  revokeKey: (jti: string) => ActionResult;
  startRealtime: () => ActionResult;
  stopRealtime: () => ActionResult;
  publishRealtime: (payload: string) => ActionResult;
}

const DashboardMockContext = createContext<DashboardMockContextValue | null>(
  null,
);

const ajv = new Ajv({ allErrors: true, strict: false });

function nowISO() {
  return new Date().toISOString();
}

function randomId(prefix: string) {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(8);
    cryptoApi.getRandomValues(bytes);
    return `${prefix}_${Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function projectIdFromName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "")
    .replace(/_{2,}/g, "_");
  if (!normalized) return "";
  return /^[a-z0-9]/.test(normalized) ? normalized : `project_${normalized}`;
}

function generateETag() {
  return `"${randomId("v").replace("v_", "").slice(0, 12)}"`;
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function createdDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function makeDoc(
  id: string,
  document: Record<string, unknown>,
  daysAgo: number,
): MockDocument {
  const created = createdDaysAgo(daysAgo);
  return {
    id,
    etag: generateETag(),
    document,
    created_at: created,
    updated_at: created,
  };
}

function cloneState(state: MockState): MockState {
  return JSON.parse(JSON.stringify(state)) as MockState;
}

function collectionNames(database: MockDatabase) {
  return Object.keys(database.collections).sort();
}

function firstCollectionName(database: MockDatabase) {
  return collectionNames(database)[0] ?? "";
}

function getCurrentCollection(state: MockState) {
  return state.databases[state.selectedDb]?.collections[
    state.selectedCollection
  ];
}

function validateSegment(kind: string, value: string) {
  const name = value.trim();
  if (!name) return `${kind} cannot be empty.`;
  if (name.length > 128) return `${kind} cannot exceed 128 characters.`;
  if (name === "." || name === ".." || name.includes("..")) {
    return `${kind} cannot contain path traversal.`;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
    return `${kind} can use letters, numbers, underscores, hyphens, and dots. It must start with a letter or number.`;
  }
  return "";
}

function validateCollectionName(name: string) {
  const base = validateSegment("Collection name", name);
  if (base) return base;
  if (name.toLowerCase() === "collections") {
    return "collections is reserved for the collection management API.";
  }
  return "";
}

function validateDatabaseName(name: string) {
  const base = validateSegment("Project database", name);
  if (base) return base;
  const lower = name.toLowerCase();
  if (lower === "databases" || lower === "collections") {
    return `${name} is reserved for the management API.`;
  }
  return "";
}

function validateFieldName(field: string) {
  const value = field.trim();
  if (!value) return "Field name cannot be empty.";
  if (value.length > 128) return "Field name cannot exceed 128 characters.";
  if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
    return "Field names can use letters, numbers, underscores, hyphens, and dots.";
  }
  return "";
}

function parseObjectJSON(text: string) {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "Document JSON must be an object." };
    }
    return { value: parsed as Record<string, unknown> };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function validateSchemaFormat(
  schemaText: string,
): { ok: true; schema: AnySchema } | { ok: false; message: string } {
  try {
    const schema = JSON.parse(schemaText) as AnySchema;
    ajv.compile(schema);
    return { ok: true, schema };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function validateDocumentWithSchema(
  schemaText: string | null,
  docText: string,
) {
  const parsed = parseObjectJSON(docText);
  if (parsed.error || !parsed.value) {
    return { ok: false, message: parsed.error ?? "Invalid document JSON." };
  }
  if (!schemaText) {
    return { ok: true, message: "This collection has no schema yet." };
  }
  const schemaResult = validateSchemaFormat(schemaText);
  if (!schemaResult.ok) {
    return { ok: false, message: schemaResult.message };
  }
  const validate = ajv.compile(schemaResult.schema);
  const valid = validate(parsed.value);
  if (valid) {
    return { ok: true, message: "This document matches the schema." };
  }
  const message =
    validate.errors
      ?.map((error) => `${error.instancePath || "document"} ${error.message}`)
      .join("; ") || "This document does not match the schema.";
  return { ok: false, message };
}

function makeCollection(
  name: string,
  documents: MockDocument[] = [],
): MockCollection {
  return {
    name,
    documents,
    indexes: [],
    ftsFields: [],
    schema: null,
    webhooks: [],
  };
}

function createInitialState(): MockState {
  const users = makeCollection("users", [
    makeDoc(
      "doc_0001",
      {
        name: "Alice Johnson",
        email: "alice@example.com",
        status: "active",
        score: 93,
      },
      1,
    ),
    makeDoc(
      "doc_0002",
      {
        name: "Bob Smith",
        email: "bob@example.com",
        status: "active",
        score: 76,
      },
      3,
    ),
    makeDoc(
      "doc_0003",
      {
        name: "Carol White",
        email: "carol@example.com",
        status: "inactive",
        score: 58,
      },
      5,
    ),
  ]);
  users.indexes = [
    { field: "email", state: "ready" },
    { field: "status", state: "ready" },
  ];
  users.schema = JSON.stringify(
    {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["name", "email"],
      properties: {
        name: { type: "string", minLength: 1 },
        email: { type: "string" },
        status: { type: "string", enum: ["active", "inactive"] },
        score: { type: "number", minimum: 0, maximum: 100 },
      },
      additionalProperties: true,
    },
    null,
    2,
  );

  const posts = makeCollection("posts", [
    makeDoc(
      "post_0001",
      {
        title: "Launch notes",
        body: "Realtime subscriptions are now easier to test.",
        status: "published",
      },
      2,
    ),
    makeDoc(
      "post_0002",
      {
        title: "Schema tips",
        body: "Use schemas to protect writes in one collection.",
        status: "draft",
      },
      7,
    ),
  ]);
  posts.ftsFields = ["title", "body"];
  posts.indexes = [{ field: "status", state: "ready" }];
  posts.webhooks = [
    {
      url: "https://api.example.com/jsonvault/webhook",
      events: ["insert", "update", "delete"],
    },
  ];

  const sessions = makeCollection("sessions", [
    makeDoc(
      "sess_0001",
      {
        user_id: "doc_0001",
        status: "active",
        expires_in: 3600,
      },
      0,
    ),
  ]);
  sessions.indexes = [{ field: "user_id", state: "ready" }];

  const database: MockDatabase = {
    name: "my_project",
    displayName: "My Project",
    status: "active",
    created_at: createdDaysAgo(6),
    collections: {
      users,
      posts,
      sessions,
    },
  };

  return {
    apiBaseUrl: "http://localhost:5766",
    selectedDb: "my_project",
    selectedCollection: "users",
    me: {
      scope: "project_admin",
      database: "my_project",
      collection: "*",
      jti: "project-owner",
      capabilities: [
        "metadata:read",
        "documents:read",
        "documents:write",
        "indexes:manage",
        "fts:manage",
        "schemas:manage",
        "webhooks:manage",
        "collections:manage",
        "operations:read",
        "operations:cancel",
        "keys:manage",
      ],
    },
    databases: {
      my_project: database,
    },
    operations: [
      {
        operation_id: "op_fts_001",
        type: "fts.configure",
        database: "my_project",
        collection: "posts",
        state: "ready",
        progress: 1,
        actor: MOCK_ACTOR,
        created_at: createdDaysAgo(1),
        updated_at: createdDaysAgo(1),
        cancellable: false,
      },
    ],
    deliveries: [
      {
        sequence: 101,
        event: {
          action: "insert",
          database: "my_project",
          collection: "posts",
          document_id: "post_0001",
        },
        status: "delivered",
        attempts: 1,
        updated_at: createdDaysAgo(1),
      },
      {
        sequence: 102,
        event: {
          action: "update",
          database: "my_project",
          collection: "posts",
          document_id: "post_0002",
        },
        status: "failed",
        attempts: 3,
        last_error: "Receiver returned HTTP 500.",
        updated_at: createdDaysAgo(0),
      },
    ],
    keys: [
      {
        jti: "tok_readwrite_default",
        scope: "read_write",
        database: "my_project",
        collection: "*",
        capabilities: ["metadata:read", "documents:read", "documents:write"],
        expires_at: addDays(90),
      },
      {
        jti: "tok_posts_readonly",
        scope: "read_only",
        database: "my_project",
        collection: "posts",
        capabilities: ["metadata:read", "documents:read"],
        expires_at: addDays(90),
      },
    ],
    realtime: {
      connected: false,
      collection: "users",
      presence: 0,
      events: [],
      nextSequence: 200,
    },
  };
}

function appendOperation(
  state: MockState,
  operation: Omit<MockOperation, "created_at" | "updated_at">,
) {
  const now = nowISO();
  state.operations = [
    { ...operation, created_at: now, updated_at: now },
    ...state.operations,
  ].slice(0, 100);
}

function appendDeliveryForEvent(
  state: MockState,
  action: string,
  collection: string,
  documentId?: string,
) {
  const sequence = state.realtime.nextSequence++;
  const delivery: MockDelivery = {
    sequence,
    event: {
      action,
      database: state.selectedDb,
      collection,
      document_id: documentId,
    },
    status: "pending",
    attempts: 0,
    updated_at: nowISO(),
  };
  state.deliveries = [delivery, ...state.deliveries].slice(0, 100);
  return sequence;
}

function appendRealtimeEvent(
  state: MockState,
  action: string,
  collection: string,
  payload: unknown,
  sequence?: number,
) {
  if (!state.realtime.connected || state.realtime.collection !== collection) {
    return;
  }
  state.realtime.events = [
    {
      id: Date.now() + Math.floor(Math.random() * 1000),
      sequence,
      type: action,
      database: state.selectedDb,
      collection,
      data:
        typeof payload === "string"
          ? payload
          : JSON.stringify(payload, null, 0),
      ts: new Date().toLocaleTimeString(),
    },
    ...state.realtime.events,
  ].slice(0, 80);
}

function runtimeCapabilities(scope: "read_only" | "read_write"): Capability[] {
  if (scope === "read_only") {
    return ["metadata:read", "documents:read"];
  }
  return ["metadata:read", "documents:read", "documents:write"];
}

export function DashboardMockProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MockState>(() => createInitialState());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MockState;
        if (parsed.databases && parsed.selectedDb) {
          setState(parsed);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [loaded, state]);

  const completeOperation = useCallback(
    (operationId: string, field?: string) => {
      window.setTimeout(() => {
        setState((prev) => {
          const next = cloneState(prev);
          const operation = next.operations.find(
            (item) => item.operation_id === operationId,
          );
          if (!operation || operation.state === "canceled") return prev;
          operation.state = "ready";
          operation.progress = 1;
          operation.updated_at = nowISO();
          if (field && operation.collection) {
            const collection =
              next.databases[operation.database]?.collections[
                operation.collection
              ];
            const index = collection?.indexes.find(
              (item) => item.field === field,
            );
            if (index) index.state = "ready";
          }
          return next;
        });
      }, 900);
    },
    [],
  );

  const value = useMemo<DashboardMockContextValue>(() => {
    const selectedDatabase =
      state.databases[state.selectedDb] ??
      Object.values(state.databases)[0] ??
      createInitialState().databases.my_project;
    const collections = Object.values(selectedDatabase.collections).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
    const selectedCollection =
      selectedDatabase.collections[state.selectedCollection] ??
      collections[0] ??
      makeCollection("default");

    return {
      state,
      selectedDatabase,
      selectedCollection,
      collections,
      setSelectedDb(database) {
        setState((prev) => {
          if (!prev.databases[database]) return prev;
          const next = cloneState(prev);
          next.selectedDb = database;
          next.me.database = database;
          next.selectedCollection = firstCollectionName(
            next.databases[database],
          );
          return next;
        });
      },
      setSelectedCollection(collection) {
        setState((prev) => {
          const db = prev.databases[prev.selectedDb];
          if (!db?.collections[collection]) return prev;
          return { ...prev, selectedCollection: collection };
        });
      },
      resetMockState() {
        const fresh = createInitialState();
        localStorage.removeItem(STORAGE_KEY);
        setState(fresh);
      },
      createProject(displayName, databaseId) {
        const projectName = displayName.trim();
        if (!projectName) {
          return { ok: false, message: "Project name cannot be empty." };
        }
        const database = (databaseId?.trim() || projectIdFromName(projectName))
          .trim()
          .toLowerCase();
        const validation = validateDatabaseName(database);
        if (validation) return { ok: false, message: validation };
        if (state.databases[database]) {
          return {
            ok: false,
            message: "A project with this database already exists.",
          };
        }
        setState((prev) => {
          const next = cloneState(prev);
          next.databases[database] = {
            name: database,
            displayName: projectName,
            status: "active",
            created_at: nowISO(),
            collections: {
              users: makeCollection("users"),
            },
          };
          next.selectedDb = database;
          next.selectedCollection = "users";
          next.me.database = database;
          return next;
        });
        return { ok: true, message: "Project created." };
      },
      createCollection(name) {
        const collection = name.trim();
        const validation = validateCollectionName(collection);
        if (validation) return { ok: false, message: validation };
        if (selectedDatabase.collections[collection]) {
          return { ok: false, message: "This collection already exists." };
        }
        setState((prev) => {
          const next = cloneState(prev);
          next.databases[next.selectedDb].collections[collection] =
            makeCollection(collection);
          next.selectedCollection = collection;
          return next;
        });
        return { ok: true, message: "Collection created." };
      },
      deleteCollection(name) {
        if (!selectedDatabase.collections[name]) {
          return { ok: false, message: "Collection was not found." };
        }
        setState((prev) => {
          const next = cloneState(prev);
          delete next.databases[next.selectedDb].collections[name];
          next.deliveries = next.deliveries.filter(
            (delivery) =>
              !(
                delivery.event.database === next.selectedDb &&
                delivery.event.collection === name
              ),
          );
          next.operations = next.operations.filter(
            (operation) =>
              !(
                operation.database === next.selectedDb &&
                operation.collection === name
              ),
          );
          if (next.realtime.collection === name) {
            next.realtime.connected = false;
            next.realtime.collection = firstCollectionName(
              next.databases[next.selectedDb],
            );
            next.realtime.presence = 0;
          }
          next.selectedCollection = firstCollectionName(
            next.databases[next.selectedDb],
          );
          return next;
        });
        return { ok: true, message: "Collection deleted." };
      },
      createDocument(body) {
        const parsed = parseObjectJSON(body);
        if (parsed.error || !parsed.value) {
          return {
            ok: false,
            message: parsed.error ?? "Invalid document JSON.",
          };
        }
        const schemaCheck = validateDocumentWithSchema(
          selectedCollection.schema,
          body,
        );
        if (!schemaCheck.ok) return schemaCheck;
        const doc: MockDocument = {
          id: randomId("doc"),
          etag: generateETag(),
          document: parsed.value,
          created_at: nowISO(),
          updated_at: nowISO(),
        };
        setState((prev) => {
          const next = cloneState(prev);
          const collection = getCurrentCollection(next);
          if (!collection) return prev;
          collection.documents = [doc, ...collection.documents];
          const sequence = appendDeliveryForEvent(
            next,
            "insert",
            collection.name,
            doc.id,
          );
          appendRealtimeEvent(next, "insert", collection.name, doc, sequence);
          return next;
        });
        return {
          ok: true,
          message: "Document created.",
          data: doc,
        };
      },
      updateDocument(id, body) {
        const parsed = parseObjectJSON(body);
        if (parsed.error || !parsed.value) {
          return {
            ok: false,
            message: parsed.error ?? "Invalid document JSON.",
          };
        }
        const schemaCheck = validateDocumentWithSchema(
          selectedCollection.schema,
          body,
        );
        if (!schemaCheck.ok) return schemaCheck;
        let updated: MockDocument | undefined;
        setState((prev) => {
          const next = cloneState(prev);
          const collection = getCurrentCollection(next);
          const index = collection?.documents.findIndex((doc) => doc.id === id);
          if (!collection || index === undefined || index < 0) return prev;
          updated = {
            ...collection.documents[index],
            document: parsed.value,
            etag: generateETag(),
            updated_at: nowISO(),
          };
          collection.documents[index] = updated;
          const sequence = appendDeliveryForEvent(
            next,
            "update",
            collection.name,
            id,
          );
          appendRealtimeEvent(
            next,
            "update",
            collection.name,
            updated,
            sequence,
          );
          return next;
        });
        return updated
          ? { ok: true, message: "Document saved.", data: updated }
          : { ok: false, message: "Document was not found." };
      },
      deleteDocument(id) {
        setState((prev) => {
          const next = cloneState(prev);
          const collection = getCurrentCollection(next);
          if (!collection) return prev;
          collection.documents = collection.documents.filter(
            (doc) => doc.id !== id,
          );
          const sequence = appendDeliveryForEvent(
            next,
            "delete",
            collection.name,
            id,
          );
          appendRealtimeEvent(
            next,
            "delete",
            collection.name,
            { document_id: id },
            sequence,
          );
          return next;
        });
        return { ok: true, message: "Document deleted." };
      },
      createIndex(field, asyncBuild) {
        const normalized = field.trim();
        const validation = validateFieldName(normalized);
        if (validation) return { ok: false, message: validation };
        if (
          selectedCollection.indexes.some((idx) => idx.field === normalized)
        ) {
          return { ok: false, message: "This field already has an index." };
        }
        if (selectedCollection.indexes.length >= 16) {
          return {
            ok: false,
            message: "Maximum indexes per collection reached.",
          };
        }
        const operationId = randomId("op");
        const index: MockIndex = {
          field: normalized,
          state: asyncBuild ? "building" : "ready",
          operation_id: operationId,
        };
        setState((prev) => {
          const next = cloneState(prev);
          const collection = getCurrentCollection(next);
          if (!collection) return prev;
          collection.indexes = [index, ...collection.indexes];
          appendOperation(next, {
            operation_id: operationId,
            type: "index.create",
            database: next.selectedDb,
            collection: collection.name,
            field: normalized,
            state: asyncBuild ? "running" : "ready",
            progress: asyncBuild ? 0.55 : 1,
            actor: MOCK_ACTOR,
            cancellable: asyncBuild,
          });
          return next;
        });
        if (asyncBuild) completeOperation(operationId, normalized);
        return {
          ok: true,
          message: "Index created.",
          data: index,
        };
      },
      deleteIndex(field) {
        setState((prev) => {
          const next = cloneState(prev);
          const collection = getCurrentCollection(next);
          if (!collection) return prev;
          collection.indexes = collection.indexes.filter(
            (index) => index.field !== field,
          );
          return next;
        });
        return { ok: true, message: "Index deleted." };
      },
      saveFTSFields(fields) {
        const normalized = Array.from(
          new Set(fields.map((field) => field.trim()).filter(Boolean)),
        );
        if (normalized.length === 0) {
          return {
            ok: false,
            message: "Add at least one searchable field before saving.",
          };
        }
        if (normalized.length > 16) {
          return {
            ok: false,
            message: "Maximum FTS fields per collection reached.",
          };
        }
        const invalid = normalized.map(validateFieldName).find(Boolean);
        if (invalid) return { ok: false, message: invalid };
        const operationId = randomId("op");
        setState((prev) => {
          const next = cloneState(prev);
          const collection = getCurrentCollection(next);
          if (!collection) return prev;
          collection.ftsFields = normalized;
          appendOperation(next, {
            operation_id: operationId,
            type: "fts.configure",
            database: next.selectedDb,
            collection: collection.name,
            state: "running",
            progress: 0.65,
            actor: MOCK_ACTOR,
            cancellable: false,
          });
          return next;
        });
        completeOperation(operationId);
        return { ok: true, message: "Search fields saved." };
      },
      saveSchema(schema) {
        const result = validateSchemaFormat(schema);
        if (!result.ok) return { ok: false, message: result.message };
        setState((prev) => {
          const next = cloneState(prev);
          const collection = getCurrentCollection(next);
          if (!collection) return prev;
          collection.schema = JSON.stringify(result.schema, null, 2);
          return next;
        });
        return { ok: true, message: "Schema saved for this collection." };
      },
      deleteSchema() {
        setState((prev) => {
          const next = cloneState(prev);
          const collection = getCurrentCollection(next);
          if (!collection) return prev;
          collection.schema = null;
          return next;
        });
        return { ok: true, message: "Schema removed from this collection." };
      },
      validateSchemaText(schema) {
        const result = validateSchemaFormat(schema);
        return result.ok
          ? { ok: true, message: "Schema format is valid." }
          : { ok: false, message: result.message };
      },
      validateDocumentAgainstSchema(documentText) {
        return validateDocumentWithSchema(
          selectedCollection.schema,
          documentText,
        );
      },
      saveWebhookTarget(url, events) {
        const target = url.trim();
        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          return { ok: false, message: "Enter a valid webhook URL." };
        }
        if (parsed.protocol !== "https:") {
          return {
            ok: false,
            message: "Use a public HTTPS endpoint for webhook targets.",
          };
        }
        if (events.length === 0) {
          return { ok: false, message: "Select at least one event to send." };
        }
        const secret = `whsec_${randomId("secret").replace("secret_", "")}`;
        setState((prev) => {
          const next = cloneState(prev);
          const collection = getCurrentCollection(next);
          if (!collection) return prev;
          const existing = collection.webhooks.filter(
            (hook) => hook.url !== target,
          );
          collection.webhooks = [...existing, { url: target, events }];
          return next;
        });
        return {
          ok: true,
          message: "Webhook target saved.",
          data: { secret },
        };
      },
      removeWebhookTarget(url) {
        setState((prev) => {
          const next = cloneState(prev);
          const collection = getCurrentCollection(next);
          if (!collection) return prev;
          collection.webhooks = collection.webhooks.filter(
            (target) => target.url !== url,
          );
          return next;
        });
        return { ok: true, message: "Webhook target removed." };
      },
      retryDelivery(sequence) {
        setState((prev) => {
          const next = cloneState(prev);
          const delivery = next.deliveries.find(
            (item) => item.sequence === sequence,
          );
          if (!delivery) return prev;
          delivery.status = "delivered";
          delivery.attempts += 1;
          delivery.last_error = "";
          delivery.updated_at = nowISO();
          return next;
        });
        return { ok: true, message: "Delivery retry completed." };
      },
      cancelOperation(operationId) {
        setState((prev) => {
          const next = cloneState(prev);
          const operation = next.operations.find(
            (item) => item.operation_id === operationId,
          );
          if (!operation) return prev;
          if (!operation.cancellable) return prev;
          operation.state = "canceled";
          operation.progress = 0;
          operation.updated_at = nowISO();
          if (
            operation.type === "index.create" &&
            operation.field &&
            operation.collection
          ) {
            const collection =
              next.databases[operation.database]?.collections[
                operation.collection
              ];
            if (collection) {
              collection.indexes = collection.indexes.filter(
                (idx) => idx.field !== operation.field,
              );
            }
          }
          return next;
        });
        return { ok: true, message: "Operation canceled." };
      },
      generateRuntimeKey(scope, database, collection) {
        const jti = randomId("tok");
        const key: MockApiKey = {
          jti,
          token: `jv_${scope}_${randomId("key").replace("key_", "")}`,
          scope,
          database: database.trim() || state.selectedDb,
          collection: collection.trim() || "*",
          capabilities: runtimeCapabilities(scope),
          expires_at: addDays(90),
        };
        setState((prev) => {
          const next = cloneState(prev);
          next.keys = [key, ...next.keys];
          return next;
        });
        return {
          ok: true,
          message: "API key generated.",
          data: key,
        };
      },
      generateProjectOwnerKey(database) {
        const key: MockApiKey = {
          jti: randomId("tok"),
          token: `jv_project_owner_${randomId("key").replace("key_", "")}`,
          scope: "project_admin",
          database,
          collection: "*",
          capabilities: state.me.capabilities,
          expires_at: addDays(90),
        };
        setState((prev) => ({ ...prev, keys: [key, ...prev.keys] }));
        return {
          ok: true,
          message: "Project owner key created.",
          data: key,
        };
      },
      revokeKey(jti) {
        setState((prev) => {
          const next = cloneState(prev);
          const key = next.keys.find((item) => item.jti === jti);
          if (key) key.revoked = true;
          return next;
        });
        return { ok: true, message: "Key revoked." };
      },
      startRealtime() {
        setState((prev) => {
          const next = cloneState(prev);
          next.realtime.connected = true;
          next.realtime.collection = next.selectedCollection;
          next.realtime.presence = 1;
          next.realtime.events = [
            {
              id: Date.now(),
              type: "connected",
              database: next.selectedDb,
              collection: next.selectedCollection,
              data: `Listening for changes in ${next.selectedCollection}`,
              ts: new Date().toLocaleTimeString(),
            },
            ...next.realtime.events,
          ];
          return next;
        });
        return { ok: true, message: "Listening started." };
      },
      stopRealtime() {
        setState((prev) => ({
          ...prev,
          realtime: {
            ...prev.realtime,
            connected: false,
            presence: 0,
          },
        }));
        return { ok: true, message: "Listening stopped." };
      },
      publishRealtime(payload) {
        const parsed = parseObjectJSON(payload);
        if (parsed.error || !parsed.value) {
          return { ok: false, message: parsed.error ?? "Invalid event JSON." };
        }
        if (!state.realtime.connected) {
          return {
            ok: false,
            message: "Start listening before sending an event.",
          };
        }
        setState((prev) => {
          const next = cloneState(prev);
          appendRealtimeEvent(
            next,
            "publish",
            next.realtime.collection,
            parsed.value,
          );
          return next;
        });
        return { ok: true, message: "Temporary event sent." };
      },
    };
  }, [state, completeOperation]);

  return (
    <DashboardMockContext.Provider value={value}>
      {children}
    </DashboardMockContext.Provider>
  );
}

export function useDashboardMock() {
  const context = useContext(DashboardMockContext);
  if (!context) {
    throw new Error(
      "useDashboardMock must be used inside DashboardMockProvider",
    );
  }
  return context;
}
