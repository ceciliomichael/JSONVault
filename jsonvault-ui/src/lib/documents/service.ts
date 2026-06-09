import {
  type CoreClient,
  createProjectCoreClient,
  isCoreApiError,
  validateCoreCollectionName,
  validateCoreNameSegment,
} from "@/lib/core";
import type {
  ProjectDocument,
  ProjectDocumentBody,
  ProjectDocumentListOptions,
  ProjectDocumentListResult,
} from "./types";

export class ProjectDocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectDocumentValidationError";
  }
}

export class ProjectDocumentConflictError extends Error {
  constructor(message = "Document changed before the write completed.") {
    super(message);
    this.name = "ProjectDocumentConflictError";
  }
}

export class ProjectDocumentNotFoundError extends Error {
  constructor(id: string) {
    super(`Document ${id} was not found.`);
    this.name = "ProjectDocumentNotFoundError";
  }
}

export class ProjectDocumentsUnavailableError extends Error {
  constructor(message = "Project documents are unavailable.") {
    super(message);
    this.name = "ProjectDocumentsUnavailableError";
  }
}

export async function listProjectDocuments(
  database: string,
  collection: string,
  options: ProjectDocumentListOptions = {},
  client: CoreClient = createProjectCoreClient(database),
): Promise<ProjectDocumentListResult> {
  const collectionName = normalizeCollectionName(collection);

  try {
    const result = await client.listDocuments<ProjectDocumentBody>({
      database,
      collection: collectionName,
      limit: options.limit,
      offset: options.offset,
      search: options.search,
    });
    return result;
  } catch (error) {
    if (isCoreApiError(error) && error.status === 404) {
      return {
        documents: [],
        total: 0,
        limit: options.limit ?? 100,
        offset: options.offset ?? 0,
      };
    }
    throw mapProjectDocumentCoreError(error, "read documents");
  }
}

export async function createProjectDocument(
  database: string,
  collection: string,
  document: ProjectDocumentBody,
  client: CoreClient = createProjectCoreClient(database),
): Promise<ProjectDocument> {
  const collectionName = normalizeCollectionName(collection);
  assertDocumentBody(document);

  try {
    return await client.createDocument<ProjectDocumentBody>({
      database,
      collection: collectionName,
      document,
    });
  } catch (error) {
    throw mapProjectDocumentCoreError(error, "create documents");
  }
}

export async function updateProjectDocument(
  database: string,
  collection: string,
  id: string,
  document: ProjectDocumentBody,
  expectedEtag: string | undefined,
  client: CoreClient = createProjectCoreClient(database),
): Promise<ProjectDocument> {
  const collectionName = normalizeCollectionName(collection);
  const documentId = normalizeDocumentId(id);
  assertDocumentBody(document);

  try {
    return await client.updateDocument<ProjectDocumentBody>({
      database,
      collection: collectionName,
      id: documentId,
      document,
      expectedEtag,
    });
  } catch (error) {
    throw mapProjectDocumentCoreError(error, "update documents");
  }
}

export async function deleteProjectDocument(
  database: string,
  collection: string,
  id: string,
  expectedEtag: string | undefined,
  client: CoreClient = createProjectCoreClient(database),
): Promise<void> {
  const collectionName = normalizeCollectionName(collection);
  const documentId = normalizeDocumentId(id);

  try {
    await client.deleteDocument({
      database,
      collection: collectionName,
      id: documentId,
      expectedEtag,
    });
  } catch (error) {
    if (isCoreApiError(error) && error.status === 404) {
      throw new ProjectDocumentNotFoundError(documentId);
    }
    throw mapProjectDocumentCoreError(error, "delete documents");
  }
}

export function parseProjectDocumentJson(value: string): ProjectDocumentBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new ProjectDocumentValidationError(
      error instanceof Error ? error.message : "Document JSON is invalid.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProjectDocumentValidationError(
      "Document JSON must be an object.",
    );
  }
  return parsed as ProjectDocumentBody;
}

function normalizeCollectionName(collection: string): string {
  const name = collection.trim();
  try {
    validateCoreCollectionName(name);
  } catch (error) {
    throw new ProjectDocumentValidationError(
      error instanceof Error ? error.message : "Collection name is invalid.",
    );
  }
  return name;
}

function normalizeDocumentId(id: string): string {
  const documentId = id.trim();
  try {
    validateCoreNameSegment("Document ID", documentId);
  } catch (error) {
    throw new ProjectDocumentValidationError(
      error instanceof Error ? error.message : "Document ID is invalid.",
    );
  }
  return documentId;
}

function assertDocumentBody(document: ProjectDocumentBody): void {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new ProjectDocumentValidationError(
      "Document JSON must be an object.",
    );
  }
}

function mapProjectDocumentCoreError(error: unknown, action: string): Error {
  if (
    error instanceof ProjectDocumentValidationError ||
    error instanceof ProjectDocumentConflictError ||
    error instanceof ProjectDocumentNotFoundError ||
    error instanceof ProjectDocumentsUnavailableError
  ) {
    return error;
  }
  if (isCoreApiError(error) && error.status === 400) {
    return new ProjectDocumentValidationError(error.message);
  }
  if (isCoreApiError(error) && error.status === 412) {
    return new ProjectDocumentConflictError(
      "Document changed before this write. Refresh and try again.",
    );
  }
  if (isCoreApiError(error) && error.status === 401) {
    return new ProjectDocumentsUnavailableError(
      "Project manager credentials were rejected by Core.",
    );
  }
  if (isCoreApiError(error) && error.status === 403) {
    return new ProjectDocumentsUnavailableError(
      `Project manager credentials cannot ${action}.`,
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}
