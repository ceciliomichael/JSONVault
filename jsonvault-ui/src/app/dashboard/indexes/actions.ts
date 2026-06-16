"use server";

import { redirect } from "next/navigation";
import { createProjectCoreClient } from "@/lib/core";
import {
  createProjectIndex,
  deleteProjectIndex,
  ProjectIndexesUnavailableError,
  ProjectIndexValidationError,
} from "@/lib/indexes";
import {
  type DashboardProject,
  getSelectedDashboardProject,
} from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import type { IndexActionResult } from "./index-state";

export async function createIndexAction(
  collection: string,
  field: string,
  asyncBuild: boolean,
): Promise<IndexActionResult> {
  const project = await requireSelectedProject();
  const client = createProjectCoreClient(project.database);

  try {
    const index = await createProjectIndex(
      project.database,
      collection,
      field,
      { async: asyncBuild },
      client,
    );
    const suffix = index.operationId ? ` Operation ${index.operationId}.` : "";
    return {
      status: "success",
      message:
        index.state === "building"
          ? `Started index build on ${index.field}.${suffix}`
          : `Created index on ${index.field}.${suffix}`,
      index,
    };
  } catch (error) {
    return handleIndexActionError(error, "Could not create the index.");
  }
}

export async function deleteIndexesAction(
  collection: string,
  fields: string[],
): Promise<IndexActionResult> {
  const project = await requireSelectedProject();
  const client = createProjectCoreClient(project.database);
  const normalizedFields = Array.from(
    new Set(fields.map((field) => field.trim()).filter(Boolean)),
  );

  if (normalizedFields.length === 0) {
    return { status: "error", message: "Choose at least one index to delete." };
  }

  const deletedFields: string[] = [];
  let firstError: unknown = null;

  const results = await Promise.allSettled(
    normalizedFields.map(async (field) => {
      try {
        const deletedField = await deleteProjectIndex(
          project.database,
          collection,
          field,
          client,
        );
        return { status: "deleted" as const, field: deletedField };
      } catch (error) {
        throw error;
      }
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      deletedFields.push(result.value.field);
    } else if (!firstError) {
      firstError = result.reason;
    }
  }

  if (firstError && deletedFields.length === 0) {
    return handleIndexActionError(
      firstError,
      "Could not delete the selected indexes.",
    );
  }

  return {
    status: "success",
    message:
      deletedFields.length === 1
        ? `Deleted index on ${deletedFields[0]}.`
        : `Deleted ${deletedFields.length} indexes.`,
    deletedFields,
  };
}

async function requireSelectedProject(): Promise<DashboardProject> {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);
  if (!project) {
    redirect("/projects");
  }
  return project;
}

function handleIndexActionError(
  error: unknown,
  fallbackMessage: string,
): IndexActionResult {
  if (
    error instanceof ProjectIndexValidationError ||
    error instanceof ProjectIndexesUnavailableError
  ) {
    return { status: "error", message: error.message };
  }

  console.error("Dashboard index action failed.", error);
  return { status: "error", message: fallbackMessage };
}
