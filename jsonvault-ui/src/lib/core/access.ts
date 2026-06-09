import type { Capability, MeResponse } from "./types";

export function canAccessCoreDatabase(
  identity: MeResponse | null,
  database: string,
): boolean {
  if (!identity) {
    return false;
  }
  if (identity.scope === "admin") {
    return true;
  }
  return identity.database === "*" || identity.database === database;
}

export function getDatabaseScopedIdentity(
  identity: MeResponse | null,
  database: string,
): MeResponse | null {
  return canAccessCoreDatabase(identity, database) ? identity : null;
}

export function hasDatabaseCapability(
  identity: MeResponse | null,
  database: string,
  capability: Capability,
): boolean {
  const scopedIdentity = getDatabaseScopedIdentity(identity, database);
  if (!scopedIdentity) {
    return false;
  }
  if (scopedIdentity.scope === "admin") {
    return true;
  }
  return scopedIdentity.capabilities?.includes(capability) ?? false;
}
