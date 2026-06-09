import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import { createProjectCoreClient } from "@/lib/core";
import { getSelectedDashboardProject } from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import type { MeResponse } from "@/lib/types";

export const metadata: Metadata = {
  title: "Dashboard — JSONVault",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);
  if (!project) {
    redirect("/projects");
  }

  const coreIdentity = await getCoreIdentity(project.database);
  return (
    <DashboardShell
      me={coreIdentity}
      project={project}
      userEmail={session.email}
      userName={session.name}
    >
      {children}
    </DashboardShell>
  );
}

async function getCoreIdentity(database: string): Promise<MeResponse | null> {
  try {
    return await createProjectCoreClient(database).getMe();
  } catch (error) {
    console.error("Dashboard Core identity failed to load.", error);
    return null;
  }
}
