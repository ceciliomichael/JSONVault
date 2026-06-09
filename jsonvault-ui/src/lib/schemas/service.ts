import {
  type CoreClient,
  createProjectCoreClient,
  isCoreApiError,
  validateCoreCollectionName,
} from "@/lib/core";
import type { ProjectSchemaJson } from "./types";

export class ProjectSchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectSchemaValidationError";
  }
}

export class ProjectSchemasUnavailableError extends Error {
  constructor(message = "Project schemas are unavailable.") {
    super(message);
    this.name = "ProjectSchemasUnavailableError";
  }
}

export async function getProjectSchema(
  database: string,
  collection: string,
  client: CoreClient = createProjectCoreClient(database),
): Promise<string | null> {
  const collectionName = normalizeCollectionName(collection);

  try {
    const response = await client.getSchema({
      database,
      collection: collectionName,
    });
    if (isNoSchemaResponse(response)) {
      return null;
    }
    if (!isSchemaJson(response)) {
      throw new ProjectSchemasUnavailableError(
        "Core returned an invalid schema response.",
      );
    }
    return JSON.stringify(response, null, 2);
  } catch (error) {
    if (isCoreApiError(error) && error.status === 404) {
      return null;
    }
    throw mapProjectSchemaCoreError(error, "read schemas");
  }
}

export async function validateProjectSchema(
  database: string,
  collection: string,
  schemaText: string,
  client: CoreClient = createProjectCoreClient(database),
): Promise<void> {
  const collectionName = normalizeCollectionName(collection);
  const schema = parseProjectSchemaJson(schemaText);

  try {
    await client.validateSchema({
      database,
      collection: collectionName,
      schema,
    });
  } catch (error) {
    throw mapProjectSchemaCoreError(error, "validate schemas");
  }
}

export async function saveProjectSchema(
  database: string,
  collection: string,
  schemaText: string,
  client: CoreClient = createProjectCoreClient(database),
): Promise<void> {
  const collectionName = normalizeCollectionName(collection);
  const schema = parseProjectSchemaJson(schemaText);

  try {
    await client.setSchema({
      database,
      collection: collectionName,
      schema,
    });
  } catch (error) {
    throw mapProjectSchemaCoreError(error, "save schemas");
  }
}

export async function deleteProjectSchema(
  database: string,
  collection: string,
  client: CoreClient = createProjectCoreClient(database),
): Promise<void> {
  const collectionName = normalizeCollectionName(collection);

  try {
    await client.deleteSchema({
      database,
      collection: collectionName,
    });
  } catch (error) {
    throw mapProjectSchemaCoreError(error, "delete schemas");
  }
}

export function parseProjectSchemaJson(value: string): ProjectSchemaJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new ProjectSchemaValidationError(
      error instanceof Error ? error.message : "Schema JSON is invalid.",
    );
  }
  if (!isSchemaJson(parsed)) {
    throw new ProjectSchemaValidationError("Schema JSON must be an object.");
  }
  return parsed;
}

function normalizeCollectionName(collection: string): string {
  const name = collection.trim();
  try {
    validateCoreCollectionName(name);
  } catch (error) {
    throw new ProjectSchemaValidationError(
      error instanceof Error ? error.message : "Collection name is invalid.",
    );
  }
  return name;
}

function isNoSchemaResponse(value: unknown): value is { schema: null } {
  return (
    isRecord(value) && Object.keys(value).length === 1 && value.schema === null
  );
}

function isSchemaJson(value: unknown): value is ProjectSchemaJson {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapProjectSchemaCoreError(error: unknown, action: string): Error {
  if (
    error instanceof ProjectSchemaValidationError ||
    error instanceof ProjectSchemasUnavailableError
  ) {
    return error;
  }
  if (isCoreApiError(error) && error.status === 400) {
    return new ProjectSchemaValidationError(readSchemaErrorMessage(error));
  }
  if (isCoreApiError(error) && error.status === 401) {
    return new ProjectSchemasUnavailableError(
      "Project manager credentials were rejected by Core.",
    );
  }
  if (isCoreApiError(error) && error.status === 403) {
    return new ProjectSchemasUnavailableError(
      `Project manager credentials cannot ${action}.`,
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

function readSchemaErrorMessage(error: {
  message: string;
  body?: unknown;
}): string {
  if (isRecord(error.body) && typeof error.body.details === "string") {
    return error.body.details;
  }
  return error.message;
}
