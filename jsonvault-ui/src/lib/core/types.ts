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

export interface GetFTSParams {
  database: string;
  collection: string;
}

export interface GetFTSResult {
  fields: string[];
}

export interface SetFTSParams {
  database: string;
  collection: string;
  fields: string[];
  async?: boolean;
}

export interface SetFTSResult {
  operation_id?: string;
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

export interface WebhookConfig {
  url: string;
  events: string[];
}

export interface WebhookDelivery {
  sequence: number | string;
  event: Record<string, unknown>;
  status: string;
  attempts: number;
  next_attempt_at?: number;
  last_error?: string;
  updated_at: number;
}

export interface GetWebhooksParams {
  database: string;
  collection: string;
}

export interface GetWebhooksResult {
  webhooks: WebhookConfig[];
}

export interface SetWebhooksParams {
  database: string;
  collection: string;
  webhooks: WebhookConfig[];
}

export interface SetWebhooksResult {
  updated: boolean;
  webhook_secret: string;
}

export interface ListWebhookDeliveriesParams {
  database: string;
  status?: string;
  limit?: number;
}

export interface ListWebhookDeliveriesResult {
  deliveries: WebhookDelivery[];
}

export interface RetryWebhookDeliveryParams {
  database: string;
  sequence: string | number;
}

export interface RetryWebhookDeliveryResult {
  retry: boolean;
  sequence: string | number;
}

export type OperationState =
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "canceling"
  | "canceled";

export interface OperationRecord {
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

export interface ListOperationsResult {
  operations: OperationRecord[];
}

export interface CancelOperationResult {
  operation_id: string;
  state: OperationState;
  updated_at: string;
}

export interface GetPresenceResult {
  database: string;
  collection: string;
  subscribers: number;
}

export interface PublishEventResult {
  published: boolean;
  database: string;
  collection: string;
}
