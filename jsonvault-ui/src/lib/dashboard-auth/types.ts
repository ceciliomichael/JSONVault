export interface DashboardUserDocument extends Record<string, unknown> {
  email: string;
  password_hash: string;
  name?: string;
  role?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DashboardUser {
  id: string;
  email: string;
  passwordHash: string;
  name?: string;
  role?: string;
}

export interface RegisterDashboardUserInput {
  email: string;
  password: string;
  name?: string;
}
