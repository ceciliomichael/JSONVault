import type { CoreDocument } from "@/lib/core";

export type ProjectDocumentBody = Record<string, unknown>;

export type ProjectDocument = CoreDocument<ProjectDocumentBody>;

export interface ProjectDocumentListResult {
  documents: ProjectDocument[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProjectDocumentListOptions {
  limit?: number;
  offset?: number;
  search?: string;
}
