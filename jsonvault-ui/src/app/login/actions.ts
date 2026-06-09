"use server";

import { redirect } from "next/navigation";
import {
  authenticateDashboardUser,
  DashboardAuthUnavailableError,
  InvalidDashboardCredentialsError,
  isValidEmail,
  normalizeEmail,
} from "@/lib/dashboard-auth";
import { setDashboardSession } from "@/lib/session";
import type { LoginActionState } from "./login-state";

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = normalizeEmail(readFormString(formData, "email"));
  const password = readFormString(formData, "password");

  if (!email || !password) {
    return fail("Email and password are required.", email);
  }
  if (!isValidEmail(email)) {
    return fail("Enter a valid email address.", email);
  }

  try {
    const user = await authenticateDashboardUser(email, password);
    await setDashboardSession({
      userId: user.id,
      email: user.email,
      name: user.name,
    });
  } catch (error) {
    if (error instanceof InvalidDashboardCredentialsError) {
      return fail("Invalid email or password.", email);
    }
    if (error instanceof DashboardAuthUnavailableError) {
      return fail(error.message, email);
    }
    if (
      error instanceof Error &&
      error.message.includes("server environment variable")
    ) {
      return fail(
        "Dashboard authentication is not configured. Check the UI server environment.",
        email,
      );
    }

    console.error("Dashboard login failed.", error);
    return fail("Could not sign in right now. Try again.", email);
  }

  redirect("/projects");
}

function fail(message: string, email: string): LoginActionState {
  return {
    status: "error",
    message,
    email,
  };
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
