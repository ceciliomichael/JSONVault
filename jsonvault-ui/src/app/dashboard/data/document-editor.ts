export const EMPTY_DOCUMENT_JSON = `{
  "name": "New document"
}`;

export const DOCUMENT_FIELD_TYPES = [
  "string",
  "number",
  "boolean",
  "null",
  "object",
  "array",
] as const;

export type DocumentFieldType = (typeof DOCUMENT_FIELD_TYPES)[number];

export interface DocumentField {
  id: string;
  name: string;
  type: DocumentFieldType;
  value: string;
}

export function createDefaultDocumentFields(): DocumentField[] {
  return [
    {
      id: fieldId(),
      name: "name",
      type: "string",
      value: "New document",
    },
  ];
}

export function fieldsToDocumentJson(fields: DocumentField[]): {
  value?: string;
  error?: string;
} {
  const document: Record<string, unknown> = {};
  for (const field of fields) {
    const name = field.name.trim();
    if (!name) {
      return { error: "Field names cannot be empty." };
    }
    if (Object.hasOwn(document, name)) {
      return { error: `Field "${name}" is duplicated.` };
    }

    const parsed = parseFieldValue(field);
    if (parsed.error) {
      return { error: `${name}: ${parsed.error}` };
    }
    document[name] = parsed.value;
  }

  return { value: JSON.stringify(document, null, 2) };
}

export function documentJsonToFields(value: string): DocumentField[] {
  const parsed = JSON.parse(value) as Record<string, unknown>;
  return Object.entries(parsed).map(([name, fieldValue]) => {
    const { type, value: serializedValue } = serializeFieldValue(fieldValue);
    return {
      id: fieldId(),
      name,
      type,
      value: serializedValue,
    };
  });
}

export function validateDocumentJson(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "Document JSON must be an object.";
    }
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function fieldId() {
  return `document_field_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseFieldValue(field: DocumentField): {
  value?: unknown;
  error?: string;
} {
  switch (field.type) {
    case "string":
      return { value: field.value };
    case "number": {
      const value = Number(field.value);
      if (!Number.isFinite(value)) {
        return { error: "Number value is invalid." };
      }
      return { value };
    }
    case "boolean": {
      const normalized = field.value.trim().toLowerCase();
      if (normalized === "true") {
        return { value: true };
      }
      if (normalized === "false") {
        return { value: false };
      }
      return { error: "Boolean value must be true or false." };
    }
    case "null":
      return { value: null };
    case "object":
    case "array": {
      let parsed: unknown;
      try {
        parsed = JSON.parse(field.value);
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : "Nested JSON is invalid.",
        };
      }
      if (field.type === "object") {
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return { error: "Value must be a JSON object." };
        }
      }
      if (field.type === "array" && !Array.isArray(parsed)) {
        return { error: "Value must be a JSON array." };
      }
      return { value: parsed };
    }
  }
}

function serializeFieldValue(value: unknown): {
  type: DocumentFieldType;
  value: string;
} {
  if (value === null) {
    return { type: "null", value: "" };
  }
  if (typeof value === "string") {
    return { type: "string", value };
  }
  if (typeof value === "number") {
    return { type: "number", value: String(value) };
  }
  if (typeof value === "boolean") {
    return { type: "boolean", value: String(value) };
  }
  if (Array.isArray(value)) {
    return { type: "array", value: JSON.stringify(value, null, 2) };
  }
  return { type: "object", value: JSON.stringify(value, null, 2) };
}
