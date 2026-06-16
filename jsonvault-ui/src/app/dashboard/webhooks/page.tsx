import { redirect } from "next/navigation";
import { createProjectCoreClient } from "@/lib/core";
import { getSelectedDashboardProject } from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import WebhooksClient from "./WebhooksClient";

export default async function WebhooksPage(props: {
  searchParams: Promise<{ collection?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);

  if (!project) {
    redirect("/projects");
  }

  const client = createProjectCoreClient(project.database);

  let collections: string[] = [];
  try {
    // Only fetching data if the user has read capabilities
    collections = await client.listCollections({
      database: project.database,
    });
  } catch (error) {
    console.error("Failed to fetch collections:", error);
  }

  // Sort collections alphabetically
  collections.sort();

  const selectedCollection =
    searchParams.collection && collections.includes(searchParams.collection)
      ? searchParams.collection
      : collections[0] || "";

  let webhooks: any[] = [];
  let allDeliveries: any[] = [];

  try {
    if (selectedCollection) {
      const webhooksRes = await client.getWebhooks({
        database: project.database,
        collection: selectedCollection,
      });
      webhooks = webhooksRes.webhooks || [];
    }

    const deliveriesRes = await client.listWebhookDeliveries({
      database: project.database,
      limit: 1000,
    });
    allDeliveries = deliveriesRes.deliveries || [];
  } catch (error) {
    console.error("Failed to fetch webhooks or deliveries:", error);
    // If we fail due to capability issues or similar, we'll just pass empty arrays
    // and let the user see no targets.
  }

  return (
    <WebhooksClient
      projectId={project.id}
      database={project.database}
      collections={collections}
      selectedCollection={selectedCollection}
      webhooks={webhooks}
      allDeliveries={allDeliveries}
    />
  );
}
