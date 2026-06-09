"use server";

import { redirect } from "next/navigation";
import { createProjectCoreClient } from "@/lib/core";
import {
  type DashboardProject,
  getSelectedDashboardProject,
} from "@/lib/projects";
import {
  deleteProjectSchema,
  ProjectSchemasUnavailableError,
  ProjectSchemaValidationError,
  saveProjectSchema,
  validateProjectSchema,
} from "@/lib/schemas";
import { requireDashboardSession } from "@/lib/session";
import type { SchemaActionResult } from "./schema-state";

export async function validateSchemaAction(
  collection: string,
  schemaText: string,
): Promise<SchemaActionResult> {
  const project = await requireSelectedProject();
  const client = createProjectCoreClient(project.database);

  try {
    await validateProjectSchema(
      project.database,
      collection,
      schemaText,
      client,
    );
    return { status: "success", message: "Schema is valid." };
  } catch (error) {
    return handleSchemaActionError(error, "Could not validate the schema.");
  }
}

export async function saveSchemaAction(
  collection: string,
  schemaText: string,
): Promise<SchemaActionResult> {
  const project = await requireSelectedProject();
  const client = createProjectCoreClient(project.database);

  try {
    await saveProjectSchema(project.database, collection, schemaText, client);
    return { status: "success", message: "Schema saved." };
  } catch (error) {
    return handleSchemaActionError(error, "Could not save the schema.");
  }
}

export async function deleteSchemaAction(
  collection: string,
): Promise<SchemaActionResult> {
  const project = await requireSelectedProject();
  const client = createProjectCoreClient(project.database);

  try {
    await deleteProjectSchema(project.database, collection, client);
    return { status: "success", message: "Schema deleted." };
  } catch (error) {
    return handleSchemaActionError(error, "Could not delete the schema.");
  }
}

async function requireSelectedProject(): Promise<DashboardProject> {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);
  if (!project) {
    redirect("/projects");
  }
  return project;
}

function handleSchemaActionError(
  error: unknown,
  fallbackMessage: string,
): SchemaActionResult {
  if (
    error instanceof ProjectSchemaValidationError ||
    error instanceof ProjectSchemasUnavailableError
  ) {
    return { status: "error", message: error.message };
  }

  console.error("Dashboard schema action failed.", error);
  return { status: "error", message: fallbackMessage };
}
