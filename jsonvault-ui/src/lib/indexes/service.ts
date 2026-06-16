import {
  type CoreClient,
  type CoreIndexInfo,
  createProjectCoreClient,
  isCoreApiError,
  validateCoreCollectionName,
  validateCoreFieldName,
} from "@/lib/core";
import type { CreateProjectIndexOptions, ProjectIndex } from "./types";

export class ProjectIndexValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectIndexValidationError";
  }
}

export class ProjectIndexesUnavailableError extends Error {
  constructor(message = "Project indexes are unavailable.") {
    super(message);
    this.name = "ProjectIndexesUnavailableError";
  }
}

export async function listProjectIndexes(
  database: string,
  collection: string,
  client: CoreClient = createProjectCoreClient(database),
): Promise<ProjectIndex[]> {
  const collectionName = normalizeCollectionName(collection);

  try {
    const result = await client.listIndexes({
      database,
      collection: collectionName,
      details: true,
    });
    const indexes = Array.isArray(result.indexes) ? result.indexes : [];
    return indexes
      .map(toProjectIndex)
      .filter((index): index is ProjectIndex => index !== null)
      .sort((a, b) => a.field.localeCompare(b.field));
  } catch (error) {
    if (isCoreApiError(error) && error.status === 404) {
      return [];
    }
    throw mapProjectIndexCoreError(error, "read indexes");
  }
}

export async function createProjectIndex(
  database: string,
  collection: string,
  field: string,
  options: CreateProjectIndexOptions = {},
  client: CoreClient = createProjectCoreClient(database),
): Promise<ProjectIndex> {
  const collectionName = normalizeCollectionName(collection);
  const fieldName = normalizeFieldName(field);

  try {
    const result = await client.createIndex({
      database,
      collection: collectionName,
      field: fieldName,
      async: options.async,
    });
    return {
      field: result.field || fieldName,
      state: result.state || (options.async ? "building" : "ready"),
      operationId: result.operation_id,
    };
  } catch (error) {
    throw mapProjectIndexCoreError(error, "create indexes");
  }
}

export async function deleteProjectIndex(
  database: string,
  collection: string,
  field: string,
  client: CoreClient = createProjectCoreClient(database),
): Promise<string> {
  const collectionName = normalizeCollectionName(collection);
  const fieldName = normalizeFieldName(field);

  try {
    const result = await client.deleteIndex({
      database,
      collection: collectionName,
      field: fieldName,
    });
    return result.field || fieldName;
  } catch (error) {
    throw mapProjectIndexCoreError(error, "delete indexes");
  }
}

function normalizeCollectionName(collection: string): string {
  const name = collection.trim();
  try {
    validateCoreCollectionName(name);
  } catch (error) {
    throw new ProjectIndexValidationError(
      error instanceof Error ? error.message : "Collection name is invalid.",
    );
  }
  return name;
}

function normalizeFieldName(field: string): string {
  const name = field.trim();
  try {
    validateCoreFieldName(name);
  } catch (error) {
    throw new ProjectIndexValidationError(
      error instanceof Error ? error.message : "Field name is invalid.",
    );
  }
  return name;
}

function toProjectIndex(value: string | CoreIndexInfo): ProjectIndex | null {
  if (typeof value === "string" && value.trim()) {
    return { field: value, state: "ready" };
  }
  if (
    value &&
    typeof value === "object" &&
    typeof value.field === "string" &&
    value.field.trim()
  ) {
    return {
      field: value.field,
      state: isIndexState(value.state) ? value.state : "ready",
      operationId:
        typeof value.operation_id === "string" ? value.operation_id : undefined,
    };
  }
  return null;
}

function isIndexState(value: unknown): value is ProjectIndex["state"] {
  return value === "ready" || value === "building" || value === "failed";
}

function mapProjectIndexCoreError(error: unknown, action: string): Error {
  if (
    error instanceof ProjectIndexValidationError ||
    error instanceof ProjectIndexesUnavailableError
  ) {
    return error;
  }
  if (isCoreApiError(error) && error.status === 400) {
    return new ProjectIndexValidationError(error.message);
  }
  if (isCoreApiError(error) && error.status === 401) {
    return new ProjectIndexesUnavailableError(
      "Project manager credentials were rejected by Core.",
    );
  }
  if (isCoreApiError(error) && error.status === 403) {
    return new ProjectIndexesUnavailableError(
      `Project manager credentials cannot ${action}.`,
    );
  }
  if (isCoreApiError(error) && error.status === 422) {
    return new ProjectIndexesUnavailableError(error.message);
  }
  if (isCoreApiError(error) && error.status === 409) {
    return new ProjectIndexValidationError(error.message || "A conflict occurred.");
  }
  if (isCoreApiError(error) && error.status === 429) {
    return new ProjectIndexesUnavailableError("Rate limit exceeded. Please try again later.");
  }
  return error instanceof Error ? error : new Error(String(error));
}

