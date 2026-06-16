import { randomBytes } from "node:crypto";
import {
  createCoreClient,
  getDashboardProjectsStorageConfig,
  isCoreApiError,
} from "@/lib/core";
import {
  normalizeProjectDatabaseName,
  validateProjectDisplayName,
} from "./names";
import type {
  CreateDashboardProjectInput,
  DashboardProject,
  DashboardProjectDocument,
} from "./types";

export class DashboardProjectsUnavailableError extends Error {
  constructor(message = "Dashboard projects are unavailable.") {
    super(message);
    this.name = "DashboardProjectsUnavailableError";
  }
}

export class DashboardProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardProjectValidationError";
  }
}

export class DashboardProjectAlreadyExistsError extends Error {
  constructor() {
    super("A project with this database already exists.");
    this.name = "DashboardProjectAlreadyExistsError";
  }
}

export class DashboardProjectNotFoundError extends Error {
  constructor() {
    super("Project not found.");
    this.name = "DashboardProjectNotFoundError";
  }
}

export async function listDashboardProjects(
  userId: string,
): Promise<DashboardProject[]> {
  const storage = getDashboardProjectsStorageConfig();
  const client = createCoreClient();

  try {
    const result = await client.listDocuments<DashboardProjectDocument>({
      database: storage.database,
      collection: storage.collection,
      limit: 200,
      filters: { owner_user_id: userId },
    });

    return result.documents
      .map((document) => toDashboardProject(document.id, document.document))
      .filter((project): project is DashboardProject => project !== null)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (error) {
    throw mapProjectCoreError(error, "read dashboard projects");
  }
}

export async function createDashboardProject(
  input: CreateDashboardProjectInput,
): Promise<DashboardProject> {
  const displayName = input.displayName.trim();
  const validationError = validateProjectDisplayName(displayName);
  if (validationError) {
    throw new DashboardProjectValidationError(validationError);
  }

  let database: string;
  try {
    const randomId = randomBytes(8).toString("hex");
    database = normalizeProjectDatabaseName(randomId);
  } catch (error) {
    throw new DashboardProjectValidationError(
      error instanceof Error
        ? error.message
        : "Failed to generate database ID.",
    );
  }
  await assertDatabaseIsAvailable(database);

  const storage = getDashboardProjectsStorageConfig();
  const client = createCoreClient();
  const now = new Date().toISOString();
  const document: DashboardProjectDocument = {
    display_name: displayName,
    database,
    owner_user_id: input.ownerUserId,
    created_at: now,
    updated_at: now,
    status: "active",
  };
  const ownerEmail = input.ownerEmail?.trim();
  if (ownerEmail) {
    document.created_by_email = ownerEmail;
  }

  try {
    const created = await client.createDocument<DashboardProjectDocument>({
      database: storage.database,
      collection: storage.collection,
      document,
    });
    const project = toDashboardProject(created.id, created.document);
    if (!project) {
      throw new DashboardProjectsUnavailableError(
        "Core returned an invalid project record.",
      );
    }
    return project;
  } catch (error) {
    throw mapProjectCoreError(error, "create dashboard projects");
  }
}

export async function getDashboardProjectForUser(
  projectId: string,
  userId: string,
): Promise<DashboardProject> {
  const storage = getDashboardProjectsStorageConfig();
  const client = createCoreClient();

  try {
    const found = await client.getDocument<DashboardProjectDocument>({
      database: storage.database,
      collection: storage.collection,
      id: projectId,
    });
    const project = toDashboardProject(found.id, found.document);
    if (!project || project.ownerUserId !== userId) {
      throw new DashboardProjectNotFoundError();
    }
    return project;
  } catch (error) {
    if (error instanceof DashboardProjectNotFoundError) {
      throw error;
    }
    if (isCoreApiError(error) && error.status === 404) {
      throw new DashboardProjectNotFoundError();
    }
    throw mapProjectCoreError(error, "read dashboard projects");
  }
}

export async function deleteDashboardProjectForUser(
  projectId: string,
  userId: string,
): Promise<DashboardProject> {
  const project = await getDashboardProjectForUser(projectId, userId);
  const storage = getDashboardProjectsStorageConfig();
  const client = createCoreClient();

  try {
    await client.deleteDocument({
      database: storage.database,
      collection: storage.collection,
      id: project.id,
    });
    return project;
  } catch (error) {
    if (isCoreApiError(error) && error.status === 404) {
      throw new DashboardProjectNotFoundError();
    }
    throw mapProjectCoreError(error, "delete dashboard projects");
  }
}

async function assertDatabaseIsAvailable(database: string): Promise<void> {
  const storage = getDashboardProjectsStorageConfig();
  const client = createCoreClient();

  try {
    const result = await client.listDocuments<DashboardProjectDocument>({
      database: storage.database,
      collection: storage.collection,
      limit: 1,
      filters: { database },
    });
    if (result.documents.length > 0) {
      throw new DashboardProjectAlreadyExistsError();
    }
  } catch (error) {
    if (error instanceof DashboardProjectAlreadyExistsError) {
      throw error;
    }
    throw mapProjectCoreError(error, "check dashboard projects");
  }
}

function toDashboardProject(
  id: string,
  document: Record<string, unknown>,
): DashboardProject | null {
  if (!isDashboardProjectDocument(document)) {
    return null;
  }

  return {
    id,
    displayName: document.display_name,
    database: document.database,
    ownerUserId: document.owner_user_id,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
    status: document.status,
  };
}

function isDashboardProjectDocument(
  value: Record<string, unknown>,
): value is DashboardProjectDocument {
  return (
    typeof value.display_name === "string" &&
    value.display_name.trim() !== "" &&
    typeof value.database === "string" &&
    value.database.trim() !== "" &&
    typeof value.owner_user_id === "string" &&
    value.owner_user_id.trim() !== "" &&
    typeof value.created_at === "string" &&
    Number.isFinite(Date.parse(value.created_at)) &&
    typeof value.updated_at === "string" &&
    Number.isFinite(Date.parse(value.updated_at)) &&
    (value.status === "active" || value.status === "archived") &&
    (value.created_by_email === undefined ||
      typeof value.created_by_email === "string")
  );
}

function mapProjectCoreError(error: unknown, action: string): Error {
  if (error instanceof DashboardProjectValidationError) {
    return error;
  }
  if (error instanceof DashboardProjectAlreadyExistsError) {
    return error;
  }
  if (isCoreApiError(error) && error.status === 401) {
    return new DashboardProjectsUnavailableError(
      "Dashboard Core API key was rejected.",
    );
  }
  if (isCoreApiError(error) && error.status === 403) {
    return new DashboardProjectsUnavailableError(
      `Dashboard Core API key cannot ${action}.`,
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}
