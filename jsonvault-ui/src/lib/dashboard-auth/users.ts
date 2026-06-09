import {
  createCoreClient,
  getDashboardAuthStorageConfig,
  isCoreApiError,
} from "@/lib/core";
import { normalizeEmail } from "./email";
import { hashPassword, verifyPassword } from "./password";
import type {
  DashboardUser,
  DashboardUserDocument,
  RegisterDashboardUserInput,
} from "./types";

export class InvalidDashboardCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidDashboardCredentialsError";
  }
}

export class DashboardAuthUnavailableError extends Error {
  constructor(message = "Dashboard authentication is unavailable.") {
    super(message);
    this.name = "DashboardAuthUnavailableError";
  }
}

export class DashboardUserAlreadyExistsError extends Error {
  constructor() {
    super("An account already exists for this email.");
    this.name = "DashboardUserAlreadyExistsError";
  }
}

export async function authenticateDashboardUser(
  email: string,
  password: string,
): Promise<DashboardUser> {
  const user = await findDashboardUserByEmail(email);
  if (!user) {
    throw new InvalidDashboardCredentialsError();
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    throw new InvalidDashboardCredentialsError();
  }

  return user;
}

export async function registerDashboardUser(
  input: RegisterDashboardUserInput,
): Promise<DashboardUser> {
  const email = normalizeEmail(input.email);
  const existing = await findDashboardUserByEmail(email);
  if (existing) {
    throw new DashboardUserAlreadyExistsError();
  }

  const storage = getDashboardAuthStorageConfig();
  const client = createCoreClient();
  const now = new Date().toISOString();
  const document: DashboardUserDocument = {
    email,
    password_hash: await hashPassword(input.password),
    created_at: now,
    updated_at: now,
    role: "operator",
  };
  const name = input.name?.trim();
  if (name) {
    document.name = name;
  }

  try {
    const created = await client.createDocument<DashboardUserDocument>({
      database: storage.database,
      collection: storage.collection,
      document,
    });

    return {
      id: created.id,
      email: normalizeEmail(created.document.email),
      passwordHash: created.document.password_hash,
      name: created.document.name,
      role: created.document.role,
    };
  } catch (error) {
    if (isCoreApiError(error) && error.status === 401) {
      throw new DashboardAuthUnavailableError(
        "Dashboard Core API key was rejected.",
      );
    }
    if (isCoreApiError(error) && error.status === 403) {
      throw new DashboardAuthUnavailableError(
        "Dashboard Core API key cannot create dashboard users.",
      );
    }
    throw error;
  }
}

export async function findDashboardUserByEmail(
  email: string,
): Promise<DashboardUser | null> {
  const storage = getDashboardAuthStorageConfig();
  const client = createCoreClient();
  const normalizedEmail = normalizeEmail(email);

  try {
    const result = await client.listDocuments<DashboardUserDocument>({
      database: storage.database,
      collection: storage.collection,
      limit: 2,
      filters: { email: normalizedEmail },
    });

    const [first, second] = result.documents;
    if (second) {
      throw new DashboardAuthUnavailableError(
        "Multiple dashboard users share the same email.",
      );
    }
    if (!first || !isDashboardUserDocument(first.document)) {
      return null;
    }

    return {
      id: first.id,
      email: normalizeEmail(first.document.email),
      passwordHash: first.document.password_hash,
      name: first.document.name,
      role: first.document.role,
    };
  } catch (error) {
    if (error instanceof DashboardAuthUnavailableError) {
      throw error;
    }
    if (isCoreApiError(error) && error.status === 401) {
      throw new DashboardAuthUnavailableError(
        "Dashboard Core API key was rejected.",
      );
    }
    if (isCoreApiError(error) && error.status === 403) {
      throw new DashboardAuthUnavailableError(
        "Dashboard Core API key cannot read dashboard users.",
      );
    }
    throw error;
  }
}

function isDashboardUserDocument(
  value: Record<string, unknown>,
): value is DashboardUserDocument {
  return (
    typeof value.email === "string" &&
    typeof value.password_hash === "string" &&
    value.password_hash.trim() !== "" &&
    (value.name === undefined || typeof value.name === "string") &&
    (value.role === undefined || typeof value.role === "string")
  );
}
