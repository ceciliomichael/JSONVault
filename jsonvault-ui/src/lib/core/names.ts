const MAX_NAME_LENGTH = 128;
const CORE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export function validateCoreNameSegment(kind: string, value: string): void {
  if (!value) {
    throw new Error(`${kind} cannot be empty.`);
  }
  if (value.length > MAX_NAME_LENGTH) {
    throw new Error(`${kind} cannot exceed ${MAX_NAME_LENGTH} characters.`);
  }
  if (value === "." || value === ".." || value.includes("..")) {
    throw new Error(`${kind} cannot contain path traversal.`);
  }
  if (!CORE_NAME_PATTERN.test(value)) {
    throw new Error(
      `${kind} must start with a letter or number and contain only letters, numbers, underscores, dashes, or dots.`,
    );
  }
}

export function validateCoreDatabaseName(value: string): void {
  validateCoreNameSegment("Database name", value);
  const lower = value.toLowerCase();
  if (lower === "databases" || lower === "collections") {
    throw new Error(`${value} is reserved for the management API.`);
  }
}

export function validateCoreCollectionName(value: string): void {
  validateCoreNameSegment("Collection name", value);
  if (value.toLowerCase() === "collections") {
    throw new Error(`${value} is reserved for the collection management API.`);
  }
}

export function validateCoreFieldName(value: string): void {
  if (!value) {
    throw new Error("Field name cannot be empty.");
  }
  if (value.length > MAX_NAME_LENGTH) {
    throw new Error(`Field name cannot exceed ${MAX_NAME_LENGTH} characters.`);
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error(
      "Field name can contain only letters, numbers, underscores, dashes, or dots.",
    );
  }
}
