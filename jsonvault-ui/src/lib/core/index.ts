export {
  canAccessCoreDatabase,
  getDatabaseScopedIdentity,
  hasDatabaseCapability,
} from "./access";
export { CoreClient, createCoreClient } from "./client";
export {
  type CoreClientConfig,
  type DashboardApiKeysStorageConfig,
  type DashboardAuthStorageConfig,
  type DashboardProjectsStorageConfig,
  getCoreApiBaseUrl,
  getCoreClientConfig,
  getDashboardApiKeysStorageConfig,
  getDashboardAuthStorageConfig,
  getDashboardProjectsStorageConfig,
  normalizeCoreBaseUrl,
} from "./config";
export { CoreApiError, isCoreApiError } from "./errors";
export {
  validateCoreCollectionName,
  validateCoreDatabaseName,
  validateCoreFieldName,
  validateCoreNameSegment,
} from "./names";
export {
  createProjectAdminToken,
  createProjectCoreClient,
  getProjectCoreClientConfig,
} from "./project-client";
export type {
  Capability,
  CoreDocument,
  CoreRequestOptions,
  CreateApiKeyParams,
  CreateApiKeyResult,
  CreateCollectionParams,
  CreateCollectionResult,
  CreateDocumentParams,
  DeleteCollectionParams,
  DeleteCollectionResult,
  DeleteDocumentParams,
  GetDocumentParams,
  ListCollectionsParams,
  ListDocumentsParams,
  ListDocumentsResult,
  MeResponse,
  RuntimeApiKeyScope,
  Scope,
  UpdateDocumentParams,
} from "./types";
