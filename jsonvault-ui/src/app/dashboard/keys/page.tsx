import { redirect } from "next/navigation";
import {
  ApiKeyMetadataUnavailableError,
  type DashboardApiKeyRecord,
  listDashboardApiKeys,
} from "@/lib/api-keys";
import { listProjectCollections } from "@/lib/collections";
import {
  createProjectCoreClient,
  hasDatabaseCapability,
  isCoreApiError,
} from "@/lib/core";
import { getSelectedDashboardProject } from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import KeysClient from "./KeysClient";

export default async function KeysPage() {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);
  if (!project) {
    redirect("/projects");
  }

  const client = createProjectCoreClient(project.database);
  const identity = await getProjectIdentity(client);
  let collections: string[] = [];
  let keys: DashboardApiKeyRecord[] = [];
  let loadError = "";

  try {
    collections = (await listProjectCollections(project.database, client)).map(
      (collection) => collection.name,
    );
  } catch (error) {
    loadError = toKeysLoadMessage(error);
  }

  try {
    keys = await listDashboardApiKeys(project.id, session.userId);
  } catch (error) {
    const message = toKeyMetadataLoadMessage(error);
    loadError = loadError ? `${loadError} ${message}` : message;
  }

  return (
    <KeysClient
      database={project.database}
      collections={collections}
      keys={keys}
      canManageKeys={hasDatabaseCapability(
        identity,
        project.database,
        "keys:manage",
      )}
      loadError={loadError}
    />
  );
}

async function getProjectIdentity(
  client: ReturnType<typeof createProjectCoreClient>,
) {
  try {
    return await client.getMe();
  } catch {
    return null;
  }
}

function toKeysLoadMessage(error: unknown): string {
  if (isCoreApiError(error) && error.status === 401) {
    return "Project manager credentials were rejected by Core.";
  }
  if (isCoreApiError(error) && error.status === 403) {
    return "Project manager credentials cannot read collections.";
  }
  if (
    error instanceof Error &&
    error.message.includes("server environment variable")
  ) {
    return "API key generation is not configured. Check the UI server environment.";
  }
  console.error("Dashboard API keys load failed.", error);
  return "Could not load API key settings right now.";
}

function toKeyMetadataLoadMessage(error: unknown): string {
  if (error instanceof ApiKeyMetadataUnavailableError) {
    return error.message;
  }
  if (
    error instanceof Error &&
    error.message.includes("server environment variable")
  ) {
    return "API key metadata storage is not configured. Check the UI server environment.";
  }
  console.error("Dashboard API key metadata load failed.", error);
  return "Could not load saved API key metadata right now.";
}
