import { validateCoreDatabaseName } from "@/lib/core";

export const MAX_PROJECT_DISPLAY_NAME_LENGTH = 120;

export function projectDatabaseFromName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "")
    .replace(/_{2,}/g, "_");

  if (!normalized) {
    return "";
  }

  return /^[a-z0-9]/.test(normalized) ? normalized : `project_${normalized}`;
}

export function normalizeProjectDatabaseName(value: string): string {
  const database = value.trim().toLowerCase();
  validateCoreDatabaseName(database);
  return database;
}

export function validateProjectDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Project name cannot be empty.";
  }
  if (trimmed.length > MAX_PROJECT_DISPLAY_NAME_LENGTH) {
    return `Project name cannot exceed ${MAX_PROJECT_DISPLAY_NAME_LENGTH} characters.`;
  }
  return null;
}
