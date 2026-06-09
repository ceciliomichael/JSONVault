import { redirect } from "next/navigation";
import { requireDashboardSession } from "@/lib/session";
import { getSelectedDashboardProject } from "@/lib/projects";
import { createProjectCoreClient } from "@/lib/core";
import WebhooksClient from "./WebhooksClient";
import { WorkspacePage } from "@/components/Workspace";

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
  
  // Only fetching data if the user has read capabilities
  const collections = await client.listCollections({
    database: project.database,
  });
  
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
