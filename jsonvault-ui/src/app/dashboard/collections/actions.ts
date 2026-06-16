"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createProjectCollection,
  deleteProjectCollection,
  ProjectCollectionNotFoundError,
  ProjectCollectionsUnavailableError,
  ProjectCollectionValidationError,
} from "@/lib/collections";
import { createProjectCoreClient } from "@/lib/core";
import {
  type DashboardProject,
  getSelectedDashboardProject,
} from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import type { CollectionActionResult } from "./collection-state";

const MAX_COLLECTIONS_PER_DELETE = 50;

export async function createCollectionAction(
  collectionName: string,
): Promise<CollectionActionResult> {
  const project = await requireSelectedProject();
  const client = createProjectCoreClient(project.database);

  try {
    const result = await createProjectCollection(
      project.database,
      collectionName,
      client,
    );
    revalidateCollections();
    if (!result.created) {
      return warning(`Collection ${result.name} already exists.`);
    }
    return success(`Created collection ${result.name}.`);
  } catch (error) {
    return handleCollectionMutationError(error, "create collection");
  }
}

export async function deleteCollectionsAction(
  collectionNames: string[],
): Promise<CollectionActionResult> {
  const names = Array.from(
    new Set(collectionNames.map((name) => name.trim()).filter(Boolean)),
  );
  if (names.length === 0) {
    return warning("Select at least one collection to delete.");
  }
  if (names.length > MAX_COLLECTIONS_PER_DELETE) {
    return warning(
      `Delete at most ${MAX_COLLECTIONS_PER_DELETE} collections at once.`,
    );
  }

  const project = await requireSelectedProject();
  const client = createProjectCoreClient(project.database);
  const deleted: string[] = [];
  const missing: string[] = [];
  let firstError: unknown = null;

  const results = await Promise.allSettled(
    names.map(async (name) => {
      try {
        const result = await deleteProjectCollection(
          project.database,
          name,
          client,
        );
        return { status: "deleted" as const, name: result.name };
      } catch (error) {
        if (error instanceof ProjectCollectionNotFoundError) {
          return { status: "missing" as const, name };
        }
        throw error;
      }
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value.status === "deleted") {
        deleted.push(result.value.name);
      } else {
        missing.push(result.value.name);
      }
    } else if (!firstError) {
      firstError = result.reason;
    }
  }

  if (deleted.length > 0) {
    revalidateCollections();
  }

  if (firstError && deleted.length === 0) {
    return handleCollectionMutationError(firstError, "delete collection");
  }

  if (deleted.length === 0 && missing.length > 0) {
    return warning("Selected collections were already absent.");
  }
  if (deleted.length === 1 && missing.length === 0) {
    return success(`Deleted collection ${deleted[0]}.`);
  }
  if (missing.length > 0) {
    return warning(
      `Deleted ${deleted.length} collections. ${missing.length} were already absent.`,
    );
  }
  return success(`Deleted ${deleted.length} collections.`);
}

async function requireSelectedProject(): Promise<DashboardProject> {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);
  if (!project) {
    redirect("/projects");
  }
  return project;
}

function revalidateCollections(): void {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/collections");
}

function handleCollectionMutationError(
  error: unknown,
  action: string,
): CollectionActionResult {
  if (
    error instanceof ProjectCollectionValidationError ||
    error instanceof ProjectCollectionsUnavailableError
  ) {
    return { status: "error", message: error.message };
  }

  console.error(`Dashboard collection ${action} failed.`, error);
  return {
    status: "error",
    message: `Could not ${action} right now. Try again.`,
  };
}

function success(message: string): CollectionActionResult {
  return { status: "success", message };
}

function warning(message: string): CollectionActionResult {
  return { status: "warning", message };
}
