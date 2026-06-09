import {
  type CoreClient,
  createProjectCoreClient,
  isCoreApiError,
  validateCoreCollectionName,
} from "@/lib/core";
import type {
  ProjectCollectionMutationResult,
  ProjectCollectionSummary,
} from "./types";

export class ProjectCollectionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectCollectionValidationError";
  }
}

export class ProjectCollectionNotFoundError extends Error {
  constructor(collection: string) {
    super(`Collection ${collection} was not found.`);
    this.name = "ProjectCollectionNotFoundError";
  }
}

export class ProjectCollectionsUnavailableError extends Error {
  constructor(message = "Project collections are unavailable.") {
    super(message);
    this.name = "ProjectCollectionsUnavailableError";
  }
}

export async function listProjectCollections(
  database: string,
  client: CoreClient = createProjectCoreClient(database),
): Promise<ProjectCollectionSummary[]> {
  let names: string[];
  try {
    names = await client.listCollections({ database });
  } catch (error) {
    if (isCoreApiError(error) && error.status === 404) {
      return [];
    }
    throw mapProjectCollectionCoreError(error, "list collections");
  }

  const summaries = await Promise.all(
    names.map(async (name) => ({
      name,
      documentCount: await readDocumentCount(client, database, name),
    })),
  );

  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createProjectCollection(
  database: string,
  collection: string,
  client: CoreClient = createProjectCoreClient(database),
): Promise<ProjectCollectionMutationResult> {
  const name = normalizeCollectionName(collection);

  try {
    const result = await client.createCollection({
      database,
      collection: name,
    });
    return { name: result.name, created: result.created };
  } catch (error) {
    throw mapProjectCollectionCoreError(error, "create collections");
  }
}

export async function deleteProjectCollection(
  database: string,
  collection: string,
  client: CoreClient = createProjectCoreClient(database),
): Promise<ProjectCollectionMutationResult> {
  const name = normalizeCollectionName(collection);

  try {
    const result = await client.deleteCollection({
      database,
      collection: name,
    });
    return { name: result.name, deleted: result.deleted };
  } catch (error) {
    if (isCoreApiError(error) && error.status === 404) {
      throw new ProjectCollectionNotFoundError(name);
    }
    throw mapProjectCollectionCoreError(error, "delete collections");
  }
}

function normalizeCollectionName(collection: string): string {
  const name = collection.trim();
  try {
    validateCoreCollectionName(name);
  } catch (error) {
    throw new ProjectCollectionValidationError(
      error instanceof Error ? error.message : "Collection name is invalid.",
    );
  }
  return name;
}

async function readDocumentCount(
  client: CoreClient,
  database: string,
  collection: string,
): Promise<number | null> {
  try {
    const result = await client.listDocuments({
      database,
      collection,
      limit: 1,
      offset: 0,
    });
    return result.total;
  } catch (error) {
    if (isCoreApiError(error) && error.status === 404) {
      return 0;
    }
    return null;
  }
}

function mapProjectCollectionCoreError(error: unknown, action: string): Error {
  if (
    error instanceof ProjectCollectionValidationError ||
    error instanceof ProjectCollectionNotFoundError ||
    error instanceof ProjectCollectionsUnavailableError
  ) {
    return error;
  }
  if (isCoreApiError(error) && error.status === 400) {
    return new ProjectCollectionValidationError(error.message);
  }
  if (isCoreApiError(error) && error.status === 401) {
    return new ProjectCollectionsUnavailableError(
      "Project manager credentials were rejected by Core.",
    );
  }
  if (isCoreApiError(error) && error.status === 403) {
    return new ProjectCollectionsUnavailableError(
      `Project manager credentials cannot ${action}.`,
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}
