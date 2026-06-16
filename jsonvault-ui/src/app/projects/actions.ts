"use server";

import { redirect } from "next/navigation";
import {
  createDashboardProject,
  DashboardProjectAlreadyExistsError,
  DashboardProjectNotFoundError,
  DashboardProjectsUnavailableError,
  DashboardProjectValidationError,
  deleteDashboardProjectForUser,
  getDashboardProjectForUser,
} from "@/lib/projects";
import { requireDashboardSession, updateDashboardSession } from "@/lib/session";
import type { ProjectActionState } from "./project-state";

export async function createProjectAction(
  _previousState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const session = await requireDashboardSession();
  const displayName = readFormString(formData, "displayName").trim();

  try {
    const project = await createDashboardProject({
      displayName,
      ownerUserId: session.userId,
      ownerEmail: session.email,
    });
    await updateDashboardSession({
      selectedProjectId: project.id,
      selectedProjectDatabase: project.database,
    });
  } catch (error) {
    if (
      error instanceof DashboardProjectValidationError ||
      error instanceof DashboardProjectAlreadyExistsError ||
      error instanceof DashboardProjectsUnavailableError
    ) {
      return fail(error.message, displayName);
    }
    if (
      error instanceof Error &&
      error.message.includes("server environment variable")
    ) {
      return fail(
        "Project storage is not configured. Check the UI server environment.",
        displayName,
      );
    }

    console.error("Dashboard project creation failed.", error);
    return fail(
      "Could not create the project right now. Try again.",
      displayName,
    );
  }

  redirect("/dashboard");
}

export async function selectProjectAction(formData: FormData): Promise<void> {
  const session = await requireDashboardSession();
  const projectId = readFormString(formData, "projectId").trim();

  try {
    const project = await getDashboardProjectForUser(projectId, session.userId);
    await updateDashboardSession({
      selectedProjectId: project.id,
      selectedProjectDatabase: project.database,
    });
  } catch (error) {
    console.error("Dashboard project selection failed.", error);
    redirect("/projects");
  }

  redirect("/dashboard");
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const session = await requireDashboardSession();
  const projectId = readFormString(formData, "projectId").trim();

  try {
    const deleted = await deleteDashboardProjectForUser(
      projectId,
      session.userId,
    );
    if (session.selectedProjectId === deleted.id) {
      await updateDashboardSession({});
    }
  } catch (error) {
    if (!(error instanceof DashboardProjectNotFoundError)) {
      console.error("Dashboard project deletion failed.", error);
    }
  }

  redirect("/projects");
}

function fail(message: string, displayName: string): ProjectActionState {
  return {
    status: "error",
    message,
    values: { displayName },
  };
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
