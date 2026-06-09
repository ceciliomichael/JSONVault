"use server";

import { redirect } from "next/navigation";
import {
  DashboardAuthUnavailableError,
  DashboardUserAlreadyExistsError,
  isValidEmail,
  normalizeEmail,
  registerDashboardUser,
} from "@/lib/dashboard-auth";
import { setDashboardSession } from "@/lib/session";
import type { RegisterActionState } from "./register-state";

export async function registerAction(
  _previousState: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const name = readFormString(formData, "name").trim();
  const email = normalizeEmail(readFormString(formData, "email"));
  const password = readFormString(formData, "password");

  if (!email || !password) {
    return fail("Email and password are required.", name, email);
  }
  if (!isValidEmail(email)) {
    return fail("Enter a valid email address.", name, email);
  }
  if (password.length < 8) {
    return fail("Password must be at least 8 characters.", name, email);
  }
  if (name.length > 120) {
    return fail("Name cannot exceed 120 characters.", name, email);
  }

  try {
    const user = await registerDashboardUser({ email, password, name });
    await setDashboardSession({
      userId: user.id,
      email: user.email,
      name: user.name,
    });
  } catch (error) {
    if (error instanceof DashboardUserAlreadyExistsError) {
      return fail(error.message, name, email);
    }
    if (error instanceof DashboardAuthUnavailableError) {
      return fail(error.message, name, email);
    }
    if (
      error instanceof Error &&
      error.message.includes("server environment variable")
    ) {
      return fail(
        "Dashboard registration is not configured. Check the UI server environment.",
        name,
        email,
      );
    }

    console.error("Dashboard registration failed.", error);
    return fail(
      "Could not create the account right now. Try again.",
      name,
      email,
    );
  }

  redirect("/projects");
}

function fail(
  message: string,
  name: string,
  email: string,
): RegisterActionState {
  return {
    status: "error",
    message,
    values: { name, email },
  };
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
