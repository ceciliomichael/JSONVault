export interface ProjectCollectionSummary {
  name: string;
  documentCount: number | null;
}

export interface ProjectCollectionMutationResult {
  name: string;
  created?: boolean;
  deleted?: boolean;
}
