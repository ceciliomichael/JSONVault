import { redirect } from "next/navigation";
import { getDashboardSession } from "./dashboard-session";
import type { DashboardSession } from "./types";

export async function requireDashboardSession(): Promise<DashboardSession> {
  const session = await getDashboardSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}
