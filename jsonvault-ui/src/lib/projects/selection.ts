import type { DashboardSession } from "@/lib/session";
import {
  DashboardProjectNotFoundError,
  getDashboardProjectForUser,
} from "./service";
import type { DashboardProject } from "./types";

export async function getSelectedDashboardProject(
  session: DashboardSession,
): Promise<DashboardProject | null> {
  if (!session.selectedProjectId) {
    return null;
  }

  try {
    return await getDashboardProjectForUser(
      session.selectedProjectId,
      session.userId,
    );
  } catch (error) {
    if (error instanceof DashboardProjectNotFoundError) {
      return null;
    }
    throw error;
  }
}
