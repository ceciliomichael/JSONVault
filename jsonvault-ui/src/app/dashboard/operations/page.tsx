import { redirect } from "next/navigation";
import { createProjectCoreClient } from "@/lib/core";
import type { OperationRecord } from "@/lib/core/types";
import { getSelectedDashboardProject } from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import OperationsClient from "./OperationsClient";

export default async function OperationsPage() {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);

  if (!project) {
    redirect("/projects");
  }

  const client = createProjectCoreClient(project.database);

  let operations: OperationRecord[] = [];
  try {
    const res = await client.listOperations();
    operations = res.operations || [];
  } catch (error) {
    console.error("Failed to fetch operations:", error);
  }

  return (
    <OperationsClient
      projectId={project.id}
      database={project.database}
      allOperations={operations}
    />
  );
}
