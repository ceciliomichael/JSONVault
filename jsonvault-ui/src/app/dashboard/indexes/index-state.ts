import type { ProjectIndex } from "@/lib/indexes";

export interface IndexActionResult {
  status: "success" | "warning" | "error";
  message: string;
  index?: ProjectIndex;
  deletedFields?: string[];
}
