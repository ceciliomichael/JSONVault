// Core capability and auth types aligned with jsonvault-core Audit 004

export type Scope = "read_only" | "read_write" | "project_admin" | "admin";

export type Capability =
  | "metadata:read"
  | "documents:read"
  | "documents:write"
  | "indexes:manage"
  | "fts:manage"
  | "schemas:manage"
  | "webhooks:manage"
  | "collections:manage"
  | "operations:read"
  | "operations:cancel"
  | "keys:manage";

export interface MeResponse {
  scope: Scope;
  database: string;
  collection: string;
  token_id?: string;
  jti?: string;
  capabilities?: readonly Capability[];
  iat?: number;
  exp?: number;
}

export interface Document {
  id: string;
  etag: string;
  document: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
}

export interface ListResponse {
  documents: Document[];
  total: number;
  limit: number;
  offset: number;
}

export interface Index {
  field: string;
  state: "ready" | "building" | "failed";
  operation_id?: string;
}

export interface FTSConfig {
  fields: string[];
  state: "ready" | "building" | "none";
}

export interface WebhookTarget {
  url: string;
  events: string[];
}

export interface Operation {
  operation_id: string;
  type: string;
  database: string;
  collection?: string;
  actor: string;
  state: "queued" | "running" | "ready" | "failed" | "canceling" | "canceled";
  progress: number;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface AuditRecord {
  id: string;
  actor: string;
  action: string;
  target: string;
  status: string;
  error?: string;
  created_at: string;
}

export interface APIKey {
  token?: string;
  token_id?: string;
  jti?: string;
  scope: Scope;
  database: string;
  collection: string;
  expires_at: string;
}

export interface QueryLimitError {
  error: {
    code: "query_limit_exceeded";
    message: string;
    reason?: string;
    advice?: string[];
  };
}
