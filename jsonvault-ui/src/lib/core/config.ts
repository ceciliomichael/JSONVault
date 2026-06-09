import { DEFAULT_API_BASE_URL } from "@/lib/constants";
import { readRequiredServerEnv, readServerEnv } from "@/lib/server/env";
import { validateCoreCollectionName, validateCoreDatabaseName } from "./names";

export interface CoreClientConfig {
  apiBaseUrl: string;
  apiKey: string;
}

export interface DashboardAuthStorageConfig {
  database: string;
  collection: string;
}

export interface DashboardProjectsStorageConfig {
  database: string;
  collection: string;
}

export interface DashboardApiKeysStorageConfig {
  database: string;
  collection: string;
}

const DEFAULT_DASHBOARD_AUTH_DATABASE = "jsonvault_dashboard";
const DEFAULT_DASHBOARD_AUTH_COLLECTION = "dashboard_users";
const DEFAULT_DASHBOARD_PROJECTS_COLLECTION = "dashboard_projects";
const DEFAULT_DASHBOARD_API_KEYS_COLLECTION = "dashboard_api_keys";

export function getCoreClientConfig(): CoreClientConfig {
  return {
    apiBaseUrl: getCoreApiBaseUrl(),
    apiKey: readRequiredServerEnv("JSONVAULT_API_KEY"),
  };
}

export function getCoreApiBaseUrl(): string {
  return normalizeCoreBaseUrl(
    readServerEnv("JSONVAULT_API_BASE_URL") || DEFAULT_API_BASE_URL,
  );
}

export function getDashboardAuthStorageConfig(): DashboardAuthStorageConfig {
  const database =
    readServerEnv("JSONVAULT_DASHBOARD_AUTH_DATABASE") ||
    DEFAULT_DASHBOARD_AUTH_DATABASE;
  const collection =
    readServerEnv("JSONVAULT_DASHBOARD_AUTH_COLLECTION") ||
    DEFAULT_DASHBOARD_AUTH_COLLECTION;

  validateCoreDatabaseName(database);
  validateCoreCollectionName(collection);

  return { database, collection };
}

export function getDashboardProjectsStorageConfig(): DashboardProjectsStorageConfig {
  const database =
    readServerEnv("JSONVAULT_DASHBOARD_PROJECTS_DATABASE") ||
    readServerEnv("JSONVAULT_DASHBOARD_AUTH_DATABASE") ||
    DEFAULT_DASHBOARD_AUTH_DATABASE;
  const collection =
    readServerEnv("JSONVAULT_DASHBOARD_PROJECTS_COLLECTION") ||
    DEFAULT_DASHBOARD_PROJECTS_COLLECTION;

  validateCoreDatabaseName(database);
  validateCoreCollectionName(collection);

  return { database, collection };
}

export function getDashboardApiKeysStorageConfig(): DashboardApiKeysStorageConfig {
  const database =
    readServerEnv("JSONVAULT_DASHBOARD_API_KEYS_DATABASE") ||
    readServerEnv("JSONVAULT_DASHBOARD_PROJECTS_DATABASE") ||
    readServerEnv("JSONVAULT_DASHBOARD_AUTH_DATABASE") ||
    DEFAULT_DASHBOARD_AUTH_DATABASE;
  const collection =
    readServerEnv("JSONVAULT_DASHBOARD_API_KEYS_COLLECTION") ||
    DEFAULT_DASHBOARD_API_KEYS_COLLECTION;

  validateCoreDatabaseName(database);
  validateCoreCollectionName(collection);

  return { database, collection };
}

export function normalizeCoreBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("JSONVault Core API base URL cannot be empty.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("JSONVault Core API base URL must be a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("JSONVault Core API base URL must use HTTP or HTTPS.");
  }
  if (url.search || url.hash) {
    throw new Error(
      "JSONVault Core API base URL cannot include query strings or fragments.",
    );
  }

  return url.toString().replace(/\/$/, "");
}
