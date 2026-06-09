import type { Capability, MeResponse, Scope } from "@/lib/types";

export type { Capability, MeResponse, Scope };

export interface CoreDocument<TDocument extends Record<string, unknown>> {
  id: string;
  etag: string;
  document: TDocument;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
}

export interface ListDocumentsParams {
  database: string;
  collection: string;
  limit?: number;
  offset?: number;
  sort?: string;
  search?: string;
  filters?: Record<string, unknown>;
}

export interface GetDocumentParams {
  database: string;
  collection: string;
  id: string;
}

export interface DeleteDocumentParams {
  database: string;
  collection: string;
  id: string;
  expectedEtag?: string;
}

export interface ListCollectionsParams {
  database: string;
}

export interface CreateCollectionParams {
  database: string;
  collection: string;
}

export interface CreateCollectionResult {
  name: string;
  created: boolean;
}

export interface DeleteCollectionParams {
  database: string;
  collection: string;
}

export interface DeleteCollectionResult {
  name: string;
  deleted: boolean;
}

export interface GetSchemaParams {
  database: string;
  collection: string;
}

export interface ValidateSchemaParams {
  database: string;
  collection: string;
  schema: Record<string, unknown>;
}

export interface ValidateSchemaResult {
  valid: boolean;
}

export interface SetSchemaParams {
  database: string;
  collection: string;
  schema: Record<string, unknown>;
}

export interface SetSchemaResult {
  updated: boolean;
}

export interface DeleteSchemaParams {
  database: string;
  collection: string;
}

export interface DeleteSchemaResult {
  deleted: boolean;
}

export type CoreIndexState = "ready" | "building" | "failed";

export interface CoreIndexInfo {
  field: string;
  state: CoreIndexState;
  operation_id?: string;
}

export interface ListIndexesParams {
  database: string;
  collection: string;
  details?: boolean;
}

export interface ListIndexesResult {
  indexes: string[] | CoreIndexInfo[];
}

export interface CreateIndexParams {
  database: string;
  collection: string;
  field: string;
  async?: boolean;
}

export interface CreateIndexResult {
  indexed?: boolean;
  field?: string;
  state?: CoreIndexState;
  operation_id?: string;
}

export interface DeleteIndexParams {
  database: string;
  collection: string;
  field: string;
}

export interface DeleteIndexResult {
  deleted: boolean;
  field: string;
}

export type RuntimeApiKeyScope = "read_only" | "read_write";

export interface CreateApiKeyParams {
  scope: RuntimeApiKeyScope;
  database: string;
  collection: string;
}

export interface CreateApiKeyResult {
  token: string;
  jti: string;
  expires_at: string;
  scope: RuntimeApiKeyScope;
  database: string;
  collection: string;
  capabilities: Capability[];
}

export interface CreateDocumentParams<
  TDocument extends Record<string, unknown>,
> {
  database: string;
  collection: string;
  document: TDocument;
}

export interface UpdateDocumentParams<
  TDocument extends Record<string, unknown>,
> {
  database: string;
  collection: string;
  id: string;
  document: TDocument;
  expectedEtag?: string;
}

export interface ListDocumentsResult<
  TDocument extends Record<string, unknown>,
> {
  documents: CoreDocument<TDocument>[];
  total: number;
  limit: number;
  offset: number;
}

export interface CoreRequestOptions {
  method?: string;
  headers?: HeadersInit;
  body?: unknown;
  signal?: AbortSignal;
  cache?: RequestCache;
}
