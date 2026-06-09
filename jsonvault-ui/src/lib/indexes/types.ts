import type { CoreIndexState } from "@/lib/core";

export interface ProjectIndex {
  field: string;
  state: CoreIndexState;
  operationId?: string;
}

export interface CreateProjectIndexOptions {
  async?: boolean;
}
