"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProjectCoreClient } from "@/lib/core";
import {
  createProjectDocument,
  deleteProjectDocument,
  ProjectDocumentConflictError,
  ProjectDocumentNotFoundError,
  ProjectDocumentsUnavailableError,
  ProjectDocumentValidationError,
  parseProjectDocumentJson,
  updateProjectDocument,
} from "@/lib/documents";
import {
  type DashboardProject,
  getSelectedDashboardProject,
} from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import type { DocumentActionResult } from "./document-state";

const MAX_DOCUMENTS_PER_DELETE = 50;

export interface DeleteDocumentTarget {
  id: string;
  etag?: string;
}

export async function createDocumentAction(
  collection: string,
  documentJson: string,
): Promise<DocumentActionResult> {
  const project = await requireSelectedProject();
  const client = createProjectCoreClient(project.database);

  try {
    const document = parseProjectDocumentJson(documentJson);
    const created = await createProjectDocument(
      project.database,
      collection,
      document,
      client,
    );
    revalidateDocuments();
    return success(`Created document ${created.id}.`);
  } catch (error) {
    return handleDocumentMutationError(error, "create document");
  }
}

export async function updateDocumentAction(
  collection: string,
  id: string,
  expectedEtag: string | undefined,
  documentJson: string,
): Promise<DocumentActionResult> {
  const project = await requireSelectedProject();
  const client = createProjectCoreClient(project.database);

  try {
    const document = parseProjectDocumentJson(documentJson);
    await updateProjectDocument(
      project.database,
      collection,
      id,
      document,
      expectedEtag,
      client,
    );
    revalidateDocuments();
    return success(`Updated document ${id}.`);
  } catch (error) {
    return handleDocumentMutationError(error, "update document");
  }
}

export async function deleteDocumentsAction(
  collection: string,
  targets: DeleteDocumentTarget[],
): Promise<DocumentActionResult> {
  const normalizedTargets = targets
    .map((target) => ({
      id: target.id.trim(),
      etag: target.etag?.trim() || undefined,
    }))
    .filter((target) => target.id);
  if (normalizedTargets.length === 0) {
    return warning("Select at least one document to delete.");
  }
  if (normalizedTargets.length > MAX_DOCUMENTS_PER_DELETE) {
    return warning(
      `Delete at most ${MAX_DOCUMENTS_PER_DELETE} documents at once.`,
    );
  }

  const project = await requireSelectedProject();
  const client = createProjectCoreClient(project.database);
  const deleted: string[] = [];
  const missing: string[] = [];
  let firstError: unknown = null;

  const results = await Promise.allSettled(
    normalizedTargets.map(async (target) => {
      try {
        await deleteProjectDocument(
          project.database,
          collection,
          target.id,
          target.etag,
          client,
        );
        return { status: "deleted" as const, id: target.id };
      } catch (error) {
        if (error instanceof ProjectDocumentNotFoundError) {
          return { status: "missing" as const, id: target.id };
        }
        throw error;
      }
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value.status === "deleted") {
        deleted.push(result.value.id);
      } else {
        missing.push(result.value.id);
      }
    } else if (!firstError) {
      firstError = result.reason;
    }
  }

  if (deleted.length > 0) {
    revalidateDocuments();
  }

  if (firstError && deleted.length === 0) {
    return handleDocumentMutationError(firstError, "delete document");
  }

  if (deleted.length === 0 && missing.length > 0) {
    return warning("Selected documents were already absent.");
  }
  if (deleted.length === 1 && missing.length === 0) {
    return success(`Deleted document ${deleted[0]}.`);
  }
  if (missing.length > 0) {
    return warning(
      `Deleted ${deleted.length} documents. ${missing.length} were already absent.`,
    );
  }
  return success(`Deleted ${deleted.length} documents.`);
}

async function requireSelectedProject(): Promise<DashboardProject> {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);
  if (!project) {
    redirect("/projects");
  }
  return project;
}

function revalidateDocuments(): void {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/collections");
  revalidatePath("/dashboard/data");
}

function handleDocumentMutationError(
  error: unknown,
  action: string,
): DocumentActionResult {
  if (
    error instanceof ProjectDocumentValidationError ||
    error instanceof ProjectDocumentConflictError ||
    error instanceof ProjectDocumentsUnavailableError
  ) {
    return { status: "error", message: error.message };
  }

  console.error(`Dashboard document ${action} failed.`, error);
  return {
    status: "error",
    message: `Could not ${action} right now. Try again.`,
  };
}

function success(message: string): DocumentActionResult {
  return { status: "success", message };
}

function warning(message: string): DocumentActionResult {
  return { status: "warning", message };
}
