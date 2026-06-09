import { cookies } from "next/headers";
import {
  type DashboardSessionConfig,
  getDashboardSessionConfig,
} from "./config";
import { signJsonPayload, verifyJsonPayload } from "./signing";
import type {
  CreateDashboardSessionInput,
  DashboardSession,
  UpdateDashboardSessionInput,
} from "./types";

export function createDashboardSession(
  input: CreateDashboardSessionInput,
  config: DashboardSessionConfig = getDashboardSessionConfig(),
  now: Date = new Date(),
): DashboardSession {
  const expiresAt = new Date(now.getTime() + config.ttlSeconds * 1000);

  return {
    userId: input.userId,
    email: input.email,
    name: input.name,
    selectedProjectId: input.selectedProjectId,
    selectedProjectDatabase: input.selectedProjectDatabase,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getDashboardSession(): Promise<DashboardSession | null> {
  const config = getDashboardSessionConfig();
  const cookieStore = await cookies();
  const rawSession = cookieStore.get(config.cookieName)?.value;
  if (!rawSession) {
    return null;
  }

  const session = verifyJsonPayload<unknown>(rawSession, config.secret);
  if (!isDashboardSession(session) || isExpired(session)) {
    return null;
  }

  return session;
}

export async function setDashboardSession(
  input: CreateDashboardSessionInput,
): Promise<DashboardSession> {
  const config = getDashboardSessionConfig();
  const session = createDashboardSession(input, config);
  const cookieStore = await cookies();

  cookieStore.set({
    name: config.cookieName,
    value: signJsonPayload(session, config.secret),
    httpOnly: true,
    sameSite: "lax",
    secure: config.secure,
    path: "/",
    maxAge: config.ttlSeconds,
  });

  return session;
}

export async function updateDashboardSession(
  input: UpdateDashboardSessionInput,
): Promise<DashboardSession> {
  const existing = await getDashboardSession();
  if (!existing) {
    throw new Error("Dashboard session is required.");
  }

  const config = getDashboardSessionConfig();
  const session: DashboardSession = {
    ...existing,
    selectedProjectId: input.selectedProjectId,
    selectedProjectDatabase: input.selectedProjectDatabase,
  };
  const cookieStore = await cookies();

  cookieStore.set({
    name: config.cookieName,
    value: signJsonPayload(session, config.secret),
    httpOnly: true,
    sameSite: "lax",
    secure: config.secure,
    path: "/",
    maxAge: Math.max(
      0,
      Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000),
    ),
  });

  return session;
}

export async function clearDashboardSession(): Promise<void> {
  const config = getDashboardSessionConfig();
  const cookieStore = await cookies();
  cookieStore.delete(config.cookieName);
}

function isDashboardSession(value: unknown): value is DashboardSession {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.userId === "string" &&
    value.userId.trim() !== "" &&
    typeof value.email === "string" &&
    value.email.trim() !== "" &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.expiresAt === "string" &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    (value.name === undefined || typeof value.name === "string") &&
    (value.selectedProjectId === undefined ||
      typeof value.selectedProjectId === "string") &&
    (value.selectedProjectDatabase === undefined ||
      typeof value.selectedProjectDatabase === "string")
  );
}

function isExpired(session: DashboardSession, now: Date = new Date()): boolean {
  return Date.parse(session.expiresAt) <= now.getTime();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
