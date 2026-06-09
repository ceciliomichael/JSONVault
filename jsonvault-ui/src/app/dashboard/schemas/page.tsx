import { redirect } from "next/navigation";
import { listProjectCollections } from "@/lib/collections";
import {
  createProjectCoreClient,
  hasDatabaseCapability,
  isCoreApiError,
} from "@/lib/core";
import { getSelectedDashboardProject } from "@/lib/projects";
import {
  getProjectSchema,
  ProjectSchemasUnavailableError,
} from "@/lib/schemas";
import { requireDashboardSession } from "@/lib/session";
import SchemasClient from "./SchemasClient";

type SchemasSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export default async function SchemasPage({
  searchParams,
}: {
  searchParams: SchemasSearchParams;
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
  let schemaText: string | null = null;
  let loadError = "";

  try {
    collections = (await listProjectCollections(project.database, client)).map(
      (collection) => collection.name,
    );
  } catch (error) {
    loadError = toSchemasLoadMessage(error, "read collections");
  }

  const selectedCollection = resolveSelectedCollection(
    requestedCollection,
    collections,
  );

  if (selectedCollection && !loadError) {
    try {
      schemaText = await getProjectSchema(
        project.database,
        selectedCollection,
        client,
      );
    } catch (error) {
      loadError = toSchemasLoadMessage(error, "read schemas");
    }
  }

  return (
    <SchemasClient
      database={project.database}
      collections={collections}
      selectedCollection={selectedCollection}
      schemaText={schemaText}
      canReadSchemas={
        hasDatabaseCapability(identity, project.database, "metadata:read") ||
        hasDatabaseCapability(identity, project.database, "documents:read")
      }
      canManageSchemas={hasDatabaseCapability(
        identity,
        project.database,
        "schemas:manage",
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

function toSchemasLoadMessage(error: unknown, action: string): string {
  if (error instanceof ProjectSchemasUnavailableError) {
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
    return "Project schemas are not configured. Check the UI server environment.";
  }
  console.error("Dashboard schemas load failed.", error);
  return "Could not load schemas right now.";
}
