"use server";

import { redirect } from "next/navigation";
import { clearDashboardSession } from "@/lib/session";

export async function logoutAction(): Promise<void> {
  await clearDashboardSession();
  redirect("/login");
}
