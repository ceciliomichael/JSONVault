import type { DashboardApiKeyRecord, GeneratedApiKey } from "@/lib/api-keys";

export interface KeyActionResult {
  status: "success" | "warning" | "error";
  message: string;
  key?: GeneratedApiKey;
  record?: DashboardApiKeyRecord;
}
