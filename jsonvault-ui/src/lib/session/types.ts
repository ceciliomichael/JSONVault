export interface DashboardSession {
  userId: string;
  email: string;
  name?: string;
  selectedProjectId?: string;
  selectedProjectDatabase?: string;
  createdAt: string;
  expiresAt: string;
}

export interface CreateDashboardSessionInput {
  userId: string;
  email: string;
  name?: string;
  selectedProjectId?: string;
  selectedProjectDatabase?: string;
}

export interface UpdateDashboardSessionInput {
  selectedProjectId?: string;
  selectedProjectDatabase?: string;
}
