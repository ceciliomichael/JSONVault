"use server";

import { revalidatePath } from "next/cache";
import { createProjectCoreClient } from "@/lib/core";
import { getSelectedDashboardProject } from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";

export async function cancelOperationAction(
  projectId: string,
  database: string,
  operationId: string,
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
    const result = await client.cancelOperation(operationId);

    // Check if the cancellation was actually processed
    if (result.state === "canceling" || result.state === "canceled") {
      revalidatePath("/dashboard/operations");
      return {
        success: true,
        message: "Operation cancel requested.",
      };
    } else {
      return {
        success: false,
        message: "Operation could not be canceled.",
      };
    }
  } catch (error: unknown) {
    console.error("Failed to cancel operation:", error);

    let message = "Failed to cancel operation";
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
