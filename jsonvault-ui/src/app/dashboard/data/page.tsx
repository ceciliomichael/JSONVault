import { redirect } from "next/navigation";
import { listProjectCollections } from "@/lib/collections";
import {
  createProjectCoreClient,
  hasDatabaseCapability,
  isCoreApiError,
} from "@/lib/core";
import { listProjectDocuments, type ProjectDocument } from "@/lib/documents";
import { getSelectedDashboardProject } from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import DataClient from "./DataClient";

const DEFAULT_LIMIT = 25;
const ALLOWED_LIMITS = new Set([10, 25, 50, 100]);

type DataSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DataPage({
  searchParams,
}: {
  searchParams: DataSearchParams;
}) {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);
  if (!project) {
    redirect("/projects");
  }

  const params = await searchParams;
  const requestedCollection = readFirst(params.collection);
  const limit = parseLimit(readFirst(params.limit));
  const offset = parseOffset(readFirst(params.offset));
  const search = readFirst(params.search).trim();

  const client = createProjectCoreClient(project.database);
  const identity = await getProjectIdentity(client);
  let collections: string[] = [];
  let documents: ProjectDocument[] = [];
  let total = 0;
  let resolvedLimit = limit;
  let resolvedOffset = offset;
  let loadError = "";

  try {
    collections = (await listProjectCollections(project.database, client)).map(
      (collection) => collection.name,
    );
  } catch (error) {
    loadError = toDocumentsLoadMessage(error, "read collections");
  }

  const selectedCollection = resolveSelectedCollection(
    requestedCollection,
    collections,
  );

  if (selectedCollection && !loadError) {
    try {
      const result = await listProjectDocuments(
        project.database,
        selectedCollection,
        { limit, offset, search },
        client,
      );
      documents = result.documents;
      total = result.total;
      resolvedLimit = result.limit || limit;
      resolvedOffset = result.offset || offset;
    } catch (error) {
      loadError = toDocumentsLoadMessage(error, "read documents");
    }
  }

  return (
    <DataClient
      database={project.database}
      collections={collections}
      selectedCollection={selectedCollection}
      documents={documents}
      total={total}
      limit={resolvedLimit}
      offset={resolvedOffset}
      search={search}
      canReadDocuments={hasDatabaseCapability(
        identity,
        project.database,
        "documents:read",
      )}
      canWriteDocuments={hasDatabaseCapability(
        identity,
        project.database,
        "documents:write",
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

function parseLimit(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return ALLOWED_LIMITS.has(parsed) ? parsed : DEFAULT_LIMIT;
}

function parseOffset(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.min(parsed, 10_000);
}

function toDocumentsLoadMessage(error: unknown, action: string): string {
  if (isCoreApiError(error) && error.status === 401) {
    return "Project manager credentials were rejected by Core.";
  }
  if (isCoreApiError(error) && error.status === 403) {
    return `Project manager credentials cannot ${action}.`;
  }
  if (isCoreApiError(error) && error.status === 422) {
    return error.message;
  }
  if (
    error instanceof Error &&
    error.message.includes("server environment variable")
  ) {
    return "Project documents are not configured. Check the UI server environment.";
  }
  console.error("Dashboard documents load failed.", error);
  return "Could not load documents right now.";
}
