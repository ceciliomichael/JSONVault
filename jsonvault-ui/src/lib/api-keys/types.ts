import type { CreateApiKeyResult, RuntimeApiKeyScope } from "@/lib/core";

export type ApiKeyScope = RuntimeApiKeyScope;

export type GeneratedApiKey = CreateApiKeyResult;

export interface DashboardApiKeyDocument extends Record<string, unknown> {
  project_id: string;
  owner_user_id: string;
  token_id: string;
  token_prefix: string;
  scope: ApiKeyScope;
  database: string;
  collection: string;
  capabilities: string[];
  expires_at: string;
  created_at: string;
}

export interface DashboardApiKeyRecord {
  id: string;
  projectId: string;
  ownerUserId: string;
  tokenId: string;
  tokenPrefix: string;
  scope: ApiKeyScope;
  database: string;
  collection: string;
  capabilities: string[];
  expiresAt: string;
  createdAt: string;
}
