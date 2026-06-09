export function assertServerOnly(context: string): void {
  if (typeof window !== "undefined") {
    throw new Error(`${context} can only be used on the server.`);
  }
}

export function readServerEnv(name: string): string {
  assertServerOnly(`Environment variable ${name}`);
  return process.env[name]?.trim() ?? "";
}

export function readRequiredServerEnv(name: string): string {
  const value = readServerEnv(name);
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}

export function readServerIntEnv(
  name: string,
  defaultValue: number,
  options: { min?: number; max?: number } = {},
): number {
  const raw = readServerEnv(name);
  if (!raw) return defaultValue;

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid integer environment variable: ${name}`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new Error(
      `Environment variable ${name} must be at least ${options.min}.`,
    );
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(
      `Environment variable ${name} must be at most ${options.max}.`,
    );
  }
  return value;
}
