import { redirect } from "next/navigation";
import {
  listProjectCollections,
  type ProjectCollectionSummary,
} from "@/lib/collections";
import {
  createProjectCoreClient,
  hasDatabaseCapability,
  isCoreApiError,
} from "@/lib/core";
import { getSelectedDashboardProject } from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import CollectionsClient from "./CollectionsClient";

export default async function CollectionsPage() {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);
  if (!project) {
    redirect("/projects");
  }

  const client = createProjectCoreClient(project.database);
  let collections: ProjectCollectionSummary[] = [];
  let loadError = "";
  const identity = await getProjectIdentity(client);

  try {
    collections = await listProjectCollections(project.database, client);
  } catch (error) {
    loadError = toCollectionsLoadMessage(error);
  }

  return (
    <CollectionsClient
      database={project.database}
      collections={collections}
      canManageCollections={hasDatabaseCapability(
        identity,
        project.database,
        "collections:manage",
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

function toCollectionsLoadMessage(error: unknown): string {
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
    return "Project collections are not configured. Check the UI server environment.";
  }
  console.error("Dashboard collections load failed.", error);
  return "Could not load collections right now.";
}
