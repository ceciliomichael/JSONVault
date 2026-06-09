import { type CoreClientConfig, getCoreClientConfig } from "./config";
import { createCoreApiError, parseResponseBody } from "./errors";
import {
  validateCoreCollectionName,
  validateCoreDatabaseName,
  validateCoreFieldName,
  validateCoreNameSegment,
} from "./names";
import type {
  CancelOperationResult,
  CoreDocument,
  CoreRequestOptions,
  CreateApiKeyParams,
  CreateApiKeyResult,
  CreateCollectionParams,
  CreateCollectionResult,
  CreateDocumentParams,
  CreateIndexParams,
  CreateIndexResult,
  DeleteCollectionParams,
  DeleteCollectionResult,
  DeleteDocumentParams,
  DeleteIndexParams,
  DeleteIndexResult,
  DeleteSchemaParams,
  DeleteSchemaResult,
  GetDocumentParams,
  GetFTSParams,
  GetFTSResult,
  GetPresenceResult,
  GetSchemaParams,
  GetWebhooksParams,
  GetWebhooksResult,
  ListCollectionsParams,
  ListDocumentsParams,
  ListDocumentsResult,
  ListIndexesParams,
  ListIndexesResult,
  ListOperationsResult,
  ListWebhookDeliveriesParams,
  ListWebhookDeliveriesResult,
  MeResponse,
  PublishEventResult,
  RetryWebhookDeliveryParams,
  RetryWebhookDeliveryResult,
  SetFTSParams,
  SetFTSResult,
  SetSchemaParams,
  SetSchemaResult,
  SetWebhooksParams,
  SetWebhooksResult,
  UpdateDocumentParams,
  ValidateSchemaParams,
  ValidateSchemaResult,
} from "./types";

export class CoreClient {
  private readonly config: CoreClientConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: CoreClientConfig, fetchImpl: typeof fetch = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async getMe(): Promise<MeResponse> {
    return this.request<MeResponse>("/api/v1/me");
  }

  async listCollections(params: ListCollectionsParams): Promise<string[]> {
    validateCoreDatabaseName(params.database);

    const collections = await this.request<unknown>(
      `/api/v1/${encodeURIComponent(params.database)}/collections`,
      { cache: "no-store" },
    );
    return Array.isArray(collections)
      ? collections.filter((collection): collection is string => {
          return typeof collection === "string" && collection.trim() !== "";
        })
      : [];
  }

  async createCollection(
    params: CreateCollectionParams,
  ): Promise<CreateCollectionResult> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);

    return this.request<CreateCollectionResult>(
      `/api/v1/${encodeURIComponent(params.database)}/collections`,
      {
        method: "POST",
        body: { name: params.collection },
      },
    );
  }

  async deleteCollection(
    params: DeleteCollectionParams,
  ): Promise<DeleteCollectionResult> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);

    return this.request<DeleteCollectionResult>(
      `/api/v1/${encodeURIComponent(params.database)}/collections/${encodeURIComponent(params.collection)}`,
      { method: "DELETE" },
    );
  }

  async createApiKey(params: CreateApiKeyParams): Promise<CreateApiKeyResult> {
    validateCoreDatabaseName(params.database);
    if (params.collection !== "*") {
      validateCoreCollectionName(params.collection);
    }

    return this.request<CreateApiKeyResult>("/api/v1/admin/keys", {
      method: "POST",
      body: {
        scope: params.scope,
        database: params.database,
        collection: params.collection,
      },
    });
  }

  async getSchema(params: GetSchemaParams): Promise<unknown> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);

    return this.request<unknown>(
      `/api/v1/${encodeURIComponent(params.database)}/${encodeURIComponent(params.collection)}/schema`,
      { cache: "no-store" },
    );
  }

  async validateSchema(
    params: ValidateSchemaParams,
  ): Promise<ValidateSchemaResult> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);

    return this.request<ValidateSchemaResult>(
      `/api/v1/${encodeURIComponent(params.database)}/${encodeURIComponent(params.collection)}/schema/validate`,
      {
        method: "POST",
        body: params.schema,
      },
    );
  }

  async setSchema(params: SetSchemaParams): Promise<SetSchemaResult> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);

    return this.request<SetSchemaResult>(
      `/api/v1/${encodeURIComponent(params.database)}/${encodeURIComponent(params.collection)}/schema`,
      {
        method: "PUT",
        body: params.schema,
      },
    );
  }

  async deleteSchema(params: DeleteSchemaParams): Promise<DeleteSchemaResult> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);

    return this.request<DeleteSchemaResult>(
      `/api/v1/${encodeURIComponent(params.database)}/${encodeURIComponent(params.collection)}/schema`,
      { method: "DELETE" },
    );
  }

  async listIndexes(params: ListIndexesParams): Promise<ListIndexesResult> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);

    const query = params.details ? "?details=true" : "";
    return this.request<ListIndexesResult>(
      `/api/v1/${encodeURIComponent(params.database)}/${encodeURIComponent(params.collection)}/indexes${query}`,
      { cache: "no-store" },
    );
  }

  async createIndex(params: CreateIndexParams): Promise<CreateIndexResult> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);
    validateCoreFieldName(params.field);

    const query = params.async ? "?async=true" : "";
    return this.request<CreateIndexResult>(
      `/api/v1/${encodeURIComponent(params.database)}/${encodeURIComponent(params.collection)}/indexes${query}`,
      {
        method: "POST",
        body: { field: params.field },
      },
    );
  }

  async deleteIndex(params: DeleteIndexParams): Promise<DeleteIndexResult> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);
    validateCoreFieldName(params.field);

    return this.request<DeleteIndexResult>(
      `/api/v1/${encodeURIComponent(params.database)}/${encodeURIComponent(params.collection)}/indexes/${encodeURIComponent(params.field)}`,
      { method: "DELETE" },
    );
  }

  async createDocument<TDocument extends Record<string, unknown>>(
    params: CreateDocumentParams<TDocument>,
  ): Promise<CoreDocument<TDocument>> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);

    return this.request<CoreDocument<TDocument>>(
      `/api/v1/${encodeURIComponent(params.database)}/${encodeURIComponent(params.collection)}`,
      {
        method: "POST",
        body: params.document,
      },
    );
  }

  async getDocument<TDocument extends Record<string, unknown>>(
    params: GetDocumentParams,
  ): Promise<CoreDocument<TDocument>> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);
    validateCoreNameSegment("Document ID", params.id);

    return this.request<CoreDocument<TDocument>>(
      `/api/v1/${encodeURIComponent(params.database)}/${encodeURIComponent(params.collection)}/${encodeURIComponent(params.id)}`,
    );
  }

  async deleteDocument(params: DeleteDocumentParams): Promise<void> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);
    validateCoreNameSegment("Document ID", params.id);

    const headers = new Headers();
    if (params.expectedEtag) {
      headers.set("If-Match", params.expectedEtag);
    }

    await this.request<void>(
      `/api/v1/${encodeURIComponent(params.database)}/${encodeURIComponent(params.collection)}/${encodeURIComponent(params.id)}`,
      { method: "DELETE", headers },
    );
  }

  async updateDocument<TDocument extends Record<string, unknown>>(
    params: UpdateDocumentParams<TDocument>,
  ): Promise<CoreDocument<TDocument>> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);
    validateCoreNameSegment("Document ID", params.id);

    const headers = new Headers();
    if (params.expectedEtag) {
      headers.set("If-Match", params.expectedEtag);
    }

    return this.request<CoreDocument<TDocument>>(
      `/api/v1/${encodeURIComponent(params.database)}/${encodeURIComponent(params.collection)}/${encodeURIComponent(params.id)}`,
      {
        method: "PUT",
        body: params.document,
        headers,
      },
    );
  }

  async listDocuments<TDocument extends Record<string, unknown>>(
    params: ListDocumentsParams,
  ): Promise<ListDocumentsResult<TDocument>> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);

    const query = new URLSearchParams();
    query.set("limit", String(params.limit ?? 100));
    query.set("offset", String(params.offset ?? 0));
    if (params.sort) {
      query.set("sort", params.sort);
    }
    if (params.search) {
      query.set("search", params.search);
    }
    for (const [field, value] of Object.entries(params.filters ?? {})) {
      validateCoreFieldName(field);
      query.set(`filter[${field}]`, JSON.stringify(value));
    }

    const path = `/api/v1/${encodeURIComponent(params.database)}/${encodeURIComponent(params.collection)}?${query.toString()}`;
    const response = await this.fetchCore(path, {
      method: "GET",
      cache: "no-store",
    });
    const body = await parseResponseBody(response);

    return {
      documents: Array.isArray(body) ? (body as CoreDocument<TDocument>[]) : [],
      total: readNumberHeader(response, "X-Total-Count"),
      limit: readNumberHeader(response, "X-Limit"),
      offset: readNumberHeader(response, "X-Offset"),
    };
  }

  async getFTS(params: GetFTSParams): Promise<GetFTSResult> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);

    return this.request<GetFTSResult>(
      `/api/v1/${encodeURIComponent(params.database)}/${encodeURIComponent(params.collection)}/fts`,
      { cache: "no-store" },
    );
  }

  async setFTS(params: SetFTSParams): Promise<SetFTSResult> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);

    const query = params.async ? "?async=true" : "";
    return this.request<SetFTSResult>(
      `/api/v1/${encodeURIComponent(params.database)}/${encodeURIComponent(params.collection)}/fts${query}`,
      {
        method: "POST",
        body: { fields: params.fields },
      },
    );
  }

  async request<T>(path: string, options: CoreRequestOptions = {}): Promise<T> {
    const response = await this.fetchCore(path, options);
    if (response.status === 204) {
      return undefined as T;
    }

    return (await parseResponseBody(response)) as T;
  }

  async getWebhooks(params: GetWebhooksParams): Promise<GetWebhooksResult> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);
    const res = await this.fetchCore(
      `/api/v1/${params.database}/${params.collection}/webhooks`,
    );
    return (await parseResponseBody(res)) as GetWebhooksResult;
  }

  async setWebhooks(params: SetWebhooksParams): Promise<SetWebhooksResult> {
    validateCoreDatabaseName(params.database);
    validateCoreCollectionName(params.collection);
    const res = await this.fetchCore(
      `/api/v1/${params.database}/${params.collection}/webhooks`,
      {
        method: "PUT",
        body: { webhooks: params.webhooks },
      },
    );
    return (await parseResponseBody(res)) as SetWebhooksResult;
  }

  async listWebhookDeliveries(
    params: ListWebhookDeliveriesParams,
  ): Promise<ListWebhookDeliveriesResult> {
    validateCoreDatabaseName(params.database);
    const url = new URL(
      this.buildUrl(`/api/v1/admin/webhooks/${params.database}/deliveries`),
    );
    if (params.status) {
      url.searchParams.set("status", params.status);
    }
    if (params.limit) {
      url.searchParams.set("limit", params.limit.toString());
    }
    const res = await this.fetchCore(url.pathname + url.search);
    return (await parseResponseBody(res)) as ListWebhookDeliveriesResult;
  }

  async retryWebhookDelivery(
    params: RetryWebhookDeliveryParams,
  ): Promise<RetryWebhookDeliveryResult> {
    validateCoreDatabaseName(params.database);
    const res = await this.fetchCore(
      `/api/v1/admin/webhooks/${params.database}/deliveries/${params.sequence}/retry`,
      { method: "POST" },
    );
    return (await parseResponseBody(res)) as RetryWebhookDeliveryResult;
  }

  private async fetchCore(
    path: string,
    options: CoreRequestOptions = {},
  ): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${this.config.apiKey}`);

    const init: RequestInit = {
      method: options.method ?? "GET",
      headers,
      cache: options.cache ?? "no-store",
      signal: options.signal,
    };

    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify(options.body);
    }

    const response = await this.fetchImpl(this.buildUrl(path), init);
    if (!response.ok) {
      throw await createCoreApiError(response);
    }

    return response;
  }

  async listOperations(): Promise<ListOperationsResult> {
    return this.request<ListOperationsResult>("/api/v1/operations", {
      method: "GET",
    });
  }

  async cancelOperation(operationId: string): Promise<CancelOperationResult> {
    return this.request<CancelOperationResult>(
      `/api/v1/operations/${encodeURIComponent(operationId)}/cancel`,
      { method: "POST" },
    );
  }

  async getPresence(
    database: string,
    collection: string,
  ): Promise<GetPresenceResult> {
    return this.request<GetPresenceResult>(
      `/api/v1/${encodeURIComponent(database)}/${encodeURIComponent(collection)}/presence`,
      { method: "GET" },
    );
  }

  async publishEvent(
    database: string,
    collection: string,
    payload: string,
  ): Promise<PublishEventResult> {
    return this.request<PublishEventResult>(
      `/api/v1/${encodeURIComponent(database)}/${encodeURIComponent(collection)}/publish`,
      {
        method: "POST",
        body: payload,
      },
    );
  }

  private buildUrl(path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.config.apiBaseUrl}${normalizedPath}`;
  }
}

export function createCoreClient(
  config: CoreClientConfig = getCoreClientConfig(),
): CoreClient {
  return new CoreClient(config);
}

function readNumberHeader(response: Response, name: string): number {
  const value = Number.parseInt(response.headers.get(name) ?? "0", 10);
  return Number.isFinite(value) ? value : 0;
}
