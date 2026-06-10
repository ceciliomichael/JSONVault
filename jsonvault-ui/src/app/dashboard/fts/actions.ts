"use server";

import { revalidatePath } from "next/cache";
import { createProjectCoreClient } from "@/lib/core";
import { getSelectedDashboardProject } from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";

export interface FTSActionResult {
  success: boolean;
  message: string;
}

export async function saveFTSFieldsAction(
  projectId: string,
  database: string,
  collection: string,
  fields: string[],
): Promise<FTSActionResult> {
  try {
    const session = await requireDashboardSession();
    const project = await getSelectedDashboardProject(session);
    if (!project || project.id !== projectId || project.database !== database) {
      throw new Error("Unauthorized");
    }

    const client = createProjectCoreClient(project.database);
    await client.setFTS({ database, collection, fields });

    revalidatePath("/dashboard/fts");
    return {
      success: true,
      message:
        fields.length > 0
          ? `Configured ${fields.length} searchable ${fields.length === 1 ? "field" : "fields"}.`
          : "Removed all searchable fields.",
    };
  } catch (error) {
    console.error("Failed to save FTS fields.", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to save searchable fields",
    };
  }
}
