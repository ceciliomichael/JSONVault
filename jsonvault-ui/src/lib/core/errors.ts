export interface CoreApiErrorDetails {
  status: number;
  statusText: string;
  message: string;
  code?: string;
  body?: unknown;
}

export class CoreApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly code?: string;
  readonly body?: unknown;

  constructor(details: CoreApiErrorDetails) {
    super(details.message);
    this.name = "CoreApiError";
    this.status = details.status;
    this.statusText = details.statusText;
    this.code = details.code;
    this.body = details.body;
  }
}

export function isCoreApiError(error: unknown): error is CoreApiError {
  return error instanceof CoreApiError;
}

export async function createCoreApiError(
  response: Response,
): Promise<CoreApiError> {
  const body = await parseResponseBody(response);
  const { message, code } = readCoreErrorBody(body, response.statusText);

  return new CoreApiError({
    status: response.status,
    statusText: response.statusText,
    message,
    code,
    body,
  });
}

export async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  const text = await response.text();
  return text || undefined;
}

function readCoreErrorBody(
  body: unknown,
  fallbackMessage: string,
): { message: string; code?: string } {
  if (isRecord(body)) {
    const error = body.error;
    if (typeof error === "string") {
      return { message: error };
    }
    if (isRecord(error)) {
      const message =
        readString(error.message) ??
        readString(error.reason) ??
        readString(error.code) ??
        fallbackMessage;
      return {
        message,
        code: readString(error.code),
      };
    }
    const message = readString(body.message) ?? fallbackMessage;
    return { message, code: readString(body.code) };
  }

  if (typeof body === "string") {
    return { message: body || fallbackMessage };
  }

  return { message: fallbackMessage || "JSONVault Core request failed." };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
