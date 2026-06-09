export interface CollectionActionResult {
  status: "success" | "warning" | "error";
  message: string;
}

export const idleCollectionActionResult: CollectionActionResult = {
  status: "success",
  message: "",
};
