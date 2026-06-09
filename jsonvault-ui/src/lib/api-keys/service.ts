import {
  type CoreClient,
  createCoreClient,
  createProjectCoreClient,
  getDashboardApiKeysStorageConfig,
  isCoreApiError,
  validateCoreCollectionName,
} from "@/lib/core";
import type {
  ApiKeyScope,
  DashboardApiKeyDocument,
  DashboardApiKeyRecord,
  GeneratedApiKey,
} from "./types";

export class ApiKeyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyValidationError";
  }
}

export class ApiKeysUnavailableError extends Error {
  constructor(message = "API key generation is unavailable.") {
    super(message);
    this.name = "ApiKeysUnavailableError";
  }
}

export class ApiKeyMetadataUnavailableError extends Error {
  constructor(message = "API key metadata is unavailable.") {
    super(message);
    this.name = "ApiKeyMetadataUnavailableError";
  }
}

export async function listDashboardApiKeys(
  projectId: string,
  ownerUserId: string,
): Promise<DashboardApiKeyRecord[]> {
  const storage = getDashboardApiKeysStorageConfig();
  const client = createCoreClient();

  try {
    const result = await client.listDocuments<DashboardApiKeyDocument>({
      database: storage.database,
      collection: storage.collection,
      limit: 200,
      filters: { project_id: projectId, owner_user_id: ownerUserId },
    });

    return result.documents
      .map((document) =>
        toDashboardApiKeyRecord(document.id, document.document),
      )
      .filter((record): record is DashboardApiKeyRecord => record !== null)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch (error) {
    if (isCoreApiError(error) && error.status === 404) {
      return [];
    }
    throw mapApiKeyMetadataCoreError(error, "read API key metadata");
  }
}

export async function createProjectRuntimeApiKey(
  database: string,
  scope: ApiKeyScope,
  collection: string,
  client: CoreClient = createProjectCoreClient(database),
): Promise<GeneratedApiKey> {
  const normalizedScope = normalizeRuntimeScope(scope);
  const normalizedCollection = normalizeCollectionScope(collection);

  try {
    return await client.createApiKey({
      scope: normalizedScope,
      database,
      collection: normalizedCollection,
    });
  } catch (error) {
    throw mapApiKeyCoreError(error, "generate API keys");
  }
}

export async function recordDashboardApiKeyMetadata({
  projectId,
  ownerUserId,
  key,
}: {
  projectId: string;
  ownerUserId: string;
  key: GeneratedApiKey;
}): Promise<DashboardApiKeyRecord> {
  const storage = getDashboardApiKeysStorageConfig();
  const client = createCoreClient();
  const now = new Date().toISOString();
  const document: DashboardApiKeyDocument = {
    project_id: projectId,
    owner_user_id: ownerUserId,
    token_id: key.jti,
    token_prefix: toTokenPrefix(key.token),
    scope: key.scope,
    database: key.database,
    collection: key.collection,
    capabilities: [...key.capabilities],
    expires_at: key.expires_at,
    created_at: now,
  };

  try {
    const created = await createDashboardApiKeyDocument(
      client,
      storage,
      document,
    );
    const record = toDashboardApiKeyRecord(created.id, created.document);
    if (!record) {
      throw new ApiKeyMetadataUnavailableError(
        "Core returned an invalid API key metadata record.",
      );
    }
    return record;
  } catch (error) {
    if (error instanceof ApiKeyMetadataUnavailableError) {
      throw error;
    }
    if (isCoreApiError(error) && error.status === 404) {
      return createDashboardApiKeyDocumentAfterCollectionSetup(
        client,
        storage,
        document,
      );
    }
    throw mapApiKeyMetadataCoreError(error, "store API key metadata");
  }
}

async function createDashboardApiKeyDocument(
  client: CoreClient,
  storage: ReturnType<typeof getDashboardApiKeysStorageConfig>,
  document: DashboardApiKeyDocument,
) {
  return client.createDocument<DashboardApiKeyDocument>({
    database: storage.database,
    collection: storage.collection,
    document,
  });
}

async function createDashboardApiKeyDocumentAfterCollectionSetup(
  client: CoreClient,
  storage: ReturnType<typeof getDashboardApiKeysStorageConfig>,
  document: DashboardApiKeyDocument,
): Promise<DashboardApiKeyRecord> {
  try {
    await client.createCollection({
      database: storage.database,
      collection: storage.collection,
    });
    const created = await createDashboardApiKeyDocument(
      client,
      storage,
      document,
    );
    const record = toDashboardApiKeyRecord(created.id, created.document);
    if (!record) {
      throw new ApiKeyMetadataUnavailableError(
        "Core returned an invalid API key metadata record.",
      );
    }
    return record;
  } catch (error) {
    if (error instanceof ApiKeyMetadataUnavailableError) {
      throw error;
    }
    throw mapApiKeyMetadataCoreError(error, "store API key metadata");
  }
}

function normalizeRuntimeScope(scope: string): ApiKeyScope {
  if (scope === "read_only" || scope === "read_write") {
    return scope;
  }
  throw new ApiKeyValidationError("Choose a read-only or read/write app key.");
}

function normalizeCollectionScope(collection: string): string {
  const value = collection.trim() || "*";
  if (value === "*") {
    return value;
  }

  try {
    validateCoreCollectionName(value);
  } catch (error) {
    throw new ApiKeyValidationError(
      error instanceof Error ? error.message : "Collection scope is invalid.",
    );
  }
  return value;
}

function toTokenPrefix(token: string): string {
  const normalized = token.trim();
  if (!normalized) {
    throw new ApiKeysUnavailableError("Core returned an empty API key token.");
  }
  return normalized.slice(0, 5);
}

function toDashboardApiKeyRecord(
  id: string,
  document: Record<string, unknown>,
): DashboardApiKeyRecord | null {
  if (!isDashboardApiKeyDocument(document)) {
    return null;
  }

  return {
    id,
    projectId: document.project_id,
    ownerUserId: document.owner_user_id,
    tokenId: document.token_id,
    tokenPrefix: document.token_prefix,
    scope: document.scope,
    database: document.database,
    collection: document.collection,
    capabilities: document.capabilities,
    expiresAt: document.expires_at,
    createdAt: document.created_at,
  };
}

function isDashboardApiKeyDocument(
  value: Record<string, unknown>,
): value is DashboardApiKeyDocument {
  return (
    typeof value.project_id === "string" &&
    value.project_id.trim() !== "" &&
    typeof value.owner_user_id === "string" &&
    value.owner_user_id.trim() !== "" &&
    typeof value.token_id === "string" &&
    value.token_id.trim() !== "" &&
    typeof value.token_prefix === "string" &&
    value.token_prefix.trim() !== "" &&
    (value.scope === "read_only" || value.scope === "read_write") &&
    typeof value.database === "string" &&
    value.database.trim() !== "" &&
    typeof value.collection === "string" &&
    value.collection.trim() !== "" &&
    Array.isArray(value.capabilities) &&
    value.capabilities.every((capability) => typeof capability === "string") &&
    typeof value.expires_at === "string" &&
    Number.isFinite(Date.parse(value.expires_at)) &&
    typeof value.created_at === "string" &&
    Number.isFinite(Date.parse(value.created_at))
  );
}

function mapApiKeyCoreError(error: unknown, action: string): Error {
  if (
    error instanceof ApiKeyValidationError ||
    error instanceof ApiKeysUnavailableError
  ) {
    return error;
  }
  if (isCoreApiError(error) && error.status === 400) {
    return new ApiKeyValidationError(error.message);
  }
  if (isCoreApiError(error) && error.status === 401) {
    return new ApiKeysUnavailableError(
      "Project manager credentials were rejected by Core.",
    );
  }
  if (isCoreApiError(error) && error.status === 403) {
    return new ApiKeysUnavailableError(
      `Project manager credentials cannot ${action}.`,
    );
  }
  if (isCoreApiError(error) && error.status === 501) {
    return new ApiKeysUnavailableError("Core authentication is disabled.");
  }
  return error instanceof Error ? error : new Error(String(error));
}

function mapApiKeyMetadataCoreError(error: unknown, action: string): Error {
  if (error instanceof ApiKeyMetadataUnavailableError) {
    return error;
  }
  if (isCoreApiError(error) && error.status === 401) {
    return new ApiKeyMetadataUnavailableError(
      "Dashboard Core API key was rejected.",
    );
  }
  if (isCoreApiError(error) && error.status === 403) {
    return new ApiKeyMetadataUnavailableError(
      `Dashboard Core API key cannot ${action}.`,
    );
  }
  if (isCoreApiError(error) && error.status === 404) {
    return new ApiKeyMetadataUnavailableError(
      "Dashboard API key metadata storage was not found.",
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}
