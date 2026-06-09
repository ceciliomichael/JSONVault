import {
  readRequiredServerEnv,
  readServerEnv,
  readServerIntEnv,
} from "@/lib/server/env";

export const DASHBOARD_SESSION_COOKIE_NAME = "__jsonvault_dashboard_session";
export const DEFAULT_DASHBOARD_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface DashboardSessionConfig {
  cookieName: string;
  secret: string;
  ttlSeconds: number;
  secure: boolean;
}

export function getDashboardSessionConfig(): DashboardSessionConfig {
  return {
    cookieName:
      readServerEnv("JSONVAULT_DASHBOARD_SESSION_COOKIE_NAME") ||
      DASHBOARD_SESSION_COOKIE_NAME,
    secret: readDashboardSessionSecret(),
    ttlSeconds: readServerIntEnv(
      "JSONVAULT_DASHBOARD_SESSION_TTL_SECONDS",
      DEFAULT_DASHBOARD_SESSION_TTL_SECONDS,
      { min: 300 },
    ),
    secure: process.env.NODE_ENV === "production",
  };
}

function readDashboardSessionSecret(): string {
  const dedicatedSecret = readServerEnv("JSONVAULT_DASHBOARD_SESSION_SECRET");
  if (dedicatedSecret) {
    return dedicatedSecret;
  }

  return readRequiredServerEnv("JSONVAULT_JWT_SECRET");
}
