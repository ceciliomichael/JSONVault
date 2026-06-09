import { redirect } from "next/navigation";
import { listProjectCollections } from "@/lib/collections";
import {
  createProjectCoreClient,
  hasDatabaseCapability,
  isCoreApiError,
} from "@/lib/core";
import {
  listProjectIndexes,
  type ProjectIndex,
  ProjectIndexesUnavailableError,
} from "@/lib/indexes";
import { getSelectedDashboardProject } from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import IndexesClient from "./IndexesClient";

type IndexesSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export default async function IndexesPage({
  searchParams,
}: {
  searchParams: IndexesSearchParams;
}) {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);
  if (!project) {
    redirect("/projects");
  }

  const params = await searchParams;
  const requestedCollection = readFirst(params.collection);
  const client = createProjectCoreClient(project.database);
  const identity = await getProjectIdentity(client);
  let collections: string[] = [];
  let indexes: ProjectIndex[] = [];
  let loadError = "";

  try {
    collections = (await listProjectCollections(project.database, client)).map(
      (collection) => collection.name,
    );
  } catch (error) {
    loadError = toIndexesLoadMessage(error, "read collections");
  }

  const selectedCollection = resolveSelectedCollection(
    requestedCollection,
    collections,
  );

  if (selectedCollection && !loadError) {
    try {
      indexes = await listProjectIndexes(
        project.database,
        selectedCollection,
        client,
      );
    } catch (error) {
      loadError = toIndexesLoadMessage(error, "read indexes");
    }
  }

  return (
    <IndexesClient
      database={project.database}
      collections={collections}
      selectedCollection={selectedCollection}
      indexes={indexes}
      canReadIndexes={
        hasDatabaseCapability(identity, project.database, "metadata:read") ||
        hasDatabaseCapability(identity, project.database, "documents:read")
      }
      canManageIndexes={hasDatabaseCapability(
        identity,
        project.database,
        "indexes:manage",
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

function resolveSelectedCollection(
  requestedCollection: string,
  collections: string[],
): string | undefined {
  if (requestedCollection && collections.includes(requestedCollection)) {
    return requestedCollection;
  }
  return collections[0];
}

function readFirst(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function toIndexesLoadMessage(error: unknown, action: string): string {
  if (error instanceof ProjectIndexesUnavailableError) {
    return error.message;
  }
  if (isCoreApiError(error) && error.status === 401) {
    return "Project manager credentials were rejected by Core.";
  }
  if (isCoreApiError(error) && error.status === 403) {
    return `Project manager credentials cannot ${action}.`;
  }
  if (
    error instanceof Error &&
    error.message.includes("server environment variable")
  ) {
    return "Project indexes are not configured. Check the UI server environment.";
  }
  console.error("Dashboard indexes load failed.", error);
  return "Could not load indexes right now.";
}
