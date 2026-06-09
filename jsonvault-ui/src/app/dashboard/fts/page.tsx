import { redirect } from "next/navigation";
import { listProjectCollections } from "@/lib/collections";
import {
  createProjectCoreClient,
  hasDatabaseCapability,
  isCoreApiError,
} from "@/lib/core";
import { getSelectedDashboardProject } from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import FTSClient from "./FTSClient";

type FTSSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export default async function FTSPage({
  searchParams,
}: {
  searchParams: FTSSearchParams;
}) {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);
  if (!project) {
    redirect("/projects");
  }

  const params = await searchParams;
  const requestedCollection = readFirst(params.collection);
  const searchQuery = readFirst(params.q);
  const client = createProjectCoreClient(project.database);
  const identity = await getProjectIdentity(client);
  let collections: string[] = [];
  let initialFields: string[] = [];
  let results: Array<{ id: string; document: Record<string, unknown> }> = [];
  let loadError = "";

  try {
    collections = (await listProjectCollections(project.database, client)).map(
      (collection) => collection.name,
    );
  } catch (error) {
    loadError = toFTSLoadMessage(error, "read collections");
  }

  const selectedCollection = resolveSelectedCollection(
    requestedCollection,
    collections,
  );

  if (selectedCollection && !loadError) {
    try {
      const fts = await client.getFTS({
        database: project.database,
        collection: selectedCollection,
      });
      initialFields = fts.fields || [];

      if (searchQuery && initialFields.length > 0) {
        const queryResults = await client.listDocuments({
          database: project.database,
          collection: selectedCollection,
          search: searchQuery,
          limit: 100,
        });
        results = queryResults.documents.map((doc) => ({
          id: doc.id,
          document: doc.document as Record<string, unknown>,
        }));
      }
    } catch (error) {
      loadError = toFTSLoadMessage(error, "read FTS or query documents");
    }
  }

  return (
    <FTSClient
      projectId={project.id}
      database={project.database}
      collections={collections}
      selectedCollection={selectedCollection || ""}
      initialFields={initialFields}
      searchQuery={searchQuery}
      results={results}
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

function toFTSLoadMessage(error: unknown, action: string): string {
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
    return "Project search is not configured. Check the UI server environment.";
  }
  console.error("Dashboard FTS load failed.", error);
  return "Could not load text search configuration right now.";
}
