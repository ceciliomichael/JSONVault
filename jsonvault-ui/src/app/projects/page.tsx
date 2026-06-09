import {
  DashboardProjectsUnavailableError,
  listDashboardProjects,
} from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import ProjectsClient from "./ProjectsClient";

export default async function ProjectsPage() {
  const session = await requireDashboardSession();

  try {
    const projects = await listDashboardProjects(session.userId);
    return (
      <ProjectsClient
        projects={projects}
        selectedProjectId={session.selectedProjectId}
        userEmail={session.email}
        userName={session.name}
      />
    );
  } catch (error) {
    const message =
      error instanceof DashboardProjectsUnavailableError
        ? error.message
        : "Could not load projects right now.";
    if (!(error instanceof DashboardProjectsUnavailableError)) {
      console.error("Dashboard projects failed to load.", error);
    }

    return (
      <ProjectsClient
        loadError={message}
        projects={[]}
        selectedProjectId={session.selectedProjectId}
        userEmail={session.email}
        userName={session.name}
      />
    );
  }
}
