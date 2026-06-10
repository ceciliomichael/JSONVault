export type DashboardProjectStatus = "active" | "archived";

export interface DashboardProjectDocument extends Record<string, unknown> {
  display_name: string;
  database: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
  status: DashboardProjectStatus;
  created_by_email?: string;
}

export interface DashboardProject {
  id: string;
  displayName: string;
  database: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
  status: DashboardProjectStatus;
}

export interface CreateDashboardProjectInput {
  displayName: string;
  ownerUserId: string;
  ownerEmail?: string;
}
