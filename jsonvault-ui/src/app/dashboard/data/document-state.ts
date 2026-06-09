export interface DocumentActionResult {
  status: "success" | "warning" | "error";
  message: string;
}
