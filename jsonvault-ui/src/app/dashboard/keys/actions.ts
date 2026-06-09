"use server";

import { redirect } from "next/navigation";
import {
  type ApiKeyScope,
  ApiKeysUnavailableError,
  ApiKeyValidationError,
  createProjectRuntimeApiKey,
  recordDashboardApiKeyMetadata,
} from "@/lib/api-keys";
import { createProjectCoreClient } from "@/lib/core";
import {
  type DashboardProject,
  getSelectedDashboardProject,
} from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import type { KeyActionResult } from "./key-state";

export async function generateRuntimeApiKeyAction(
  scope: ApiKeyScope,
  collection: string,
): Promise<KeyActionResult> {
  const { project, userId } = await requireSelectedProject();
  const client = createProjectCoreClient(project.database);

  try {
    const key = await createProjectRuntimeApiKey(
      project.database,
      scope,
      collection,
      client,
    );
    try {
      const record = await recordDashboardApiKeyMetadata({
        projectId: project.id,
        ownerUserId: userId,
        key,
      });
      return {
        status: "success",
        message: `Generated ${scope === "read_only" ? "read-only" : "read/write"} key ${key.jti}.`,
        key,
        record,
      };
    } catch (metadataError) {
      console.error(
        "Dashboard API key metadata storage failed.",
        metadataError,
      );
      return {
        status: "warning",
        message:
          "Generated the key, but could not save its redacted metadata. Copy it now; it will not appear in the table.",
        key,
      };
    }
  } catch (error) {
    return handleKeyGenerationError(error);
  }
}

async function requireSelectedProject(): Promise<{
  project: DashboardProject;
  userId: string;
}> {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);
  if (!project) {
    redirect("/projects");
  }

  return {
    project,
    userId: session.userId,
  };
}

function handleKeyGenerationError(error: unknown): KeyActionResult {
  if (
    error instanceof ApiKeyValidationError ||
    error instanceof ApiKeysUnavailableError
  ) {
    return { status: "error", message: error.message };
  }

  console.error("Dashboard API key generation failed.", error);
  return {
    status: "error",
    message: "Could not generate an API key right now. Try again.",
  };
}
