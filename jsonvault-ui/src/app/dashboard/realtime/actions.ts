"use server";

import { createProjectCoreClient } from "@/lib/core";
import { getSelectedDashboardProject } from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";

export async function getPresenceAction(
  projectId: string,
  database: string,
  collection: string,
) {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);

  if (!project || project.id !== projectId || project.database !== database) {
    return {
      success: false,
      message: "Invalid project context",
      presence: 0,
    };
  }

  const client = createProjectCoreClient(project.database);

  try {
    const result = await client.getPresence(database, collection);
    return {
      success: true,
      presence: result.subscribers,
    };
  } catch (error: unknown) {
    console.error("Failed to fetch presence:", error);
    return {
      success: false,
      message: "Failed to fetch presence",
      presence: 0,
    };
  }
}

export async function publishEventAction(
  projectId: string,
  database: string,
  collection: string,
  payload: string,
) {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);

  if (!project || project.id !== projectId || project.database !== database) {
    return {
      success: false,
      message: "Invalid project context",
    };
  }

  const client = createProjectCoreClient(project.database);

  try {
    await client.publishEvent(database, collection, payload);
    return {
      success: true,
      message: "Event published.",
    };
  } catch (error: unknown) {
    console.error("Failed to publish event:", error);
    let message = "Failed to publish event";
    const err = error as {
      body?: { error?: { message?: string } };
      message?: string;
    };
    if (err?.body?.error?.message) {
      message = err.body.error.message;
    } else if (err?.message) {
      message = err.message;
    }

    return {
      success: false,
      message,
    };
  }
}
