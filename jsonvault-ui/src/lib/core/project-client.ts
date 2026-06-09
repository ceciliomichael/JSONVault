import { createHmac, randomBytes } from "node:crypto";
import { readRequiredServerEnv } from "@/lib/server/env";
import { CoreClient } from "./client";
import { type CoreClientConfig, getCoreApiBaseUrl } from "./config";
import { validateCoreDatabaseName } from "./names";
import type { Capability } from "./types";

const PROJECT_MANAGER_TTL_SECONDS = 15 * 60;
const PROJECT_ADMIN_CAPABILITIES: Capability[] = [
  "metadata:read",
  "documents:read",
  "documents:write",
  "indexes:manage",
  "fts:manage",
  "schemas:manage",
  "webhooks:manage",
  "collections:manage",
  "operations:read",
  "operations:cancel",
  "keys:manage",
];

export function createProjectCoreClient(database: string): CoreClient {
  return new CoreClient(getProjectCoreClientConfig(database));
}

export function getProjectCoreClientConfig(database: string): CoreClientConfig {
  return {
    apiBaseUrl: getCoreApiBaseUrl(),
    apiKey: createProjectAdminToken(database),
  };
}

export function createProjectAdminToken(database: string): string {
  validateCoreDatabaseName(database);

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    scope: "project_admin",
    database,
    collection: "*",
    iat: now,
    nbf: now,
    exp: now + PROJECT_MANAGER_TTL_SECONDS,
    jti: randomBytes(16).toString("hex"),
    capabilities: PROJECT_ADMIN_CAPABILITIES,
  };

  return signJwt(claims, readRequiredServerEnv("JSONVAULT_JWT_SECRET"));
}

function signJwt(claims: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(claims));
  const signature = encodeBase64Url(
    createHmac("sha256", secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest(),
  );

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
