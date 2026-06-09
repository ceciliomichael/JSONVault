import { redirect } from "next/navigation";
import { createProjectCoreClient } from "@/lib/core";
import { getSelectedDashboardProject } from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import RealtimeClient from "./RealtimeClient";

export default async function RealtimePage() {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);

  if (!project) {
    redirect("/projects");
  }

  const client = createProjectCoreClient(project.database);

  let collections: string[] = [];
  try {
    collections = await client.listCollections({ database: project.database });
  } catch (error) {
    console.error("Failed to fetch collections:", error);
  }

  return (
    <RealtimeClient
      projectId={project.id}
      database={project.database}
      initialCollections={collections}
    />
  );
}
