export class JSONVaultError extends Error {
  constructor(message, { status = 0, code = "request_failed", details = null } = {}) {
    super(message);
    this.name = "JSONVaultError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class JSONVaultClient {
  constructor(baseUrl, apiKey, { fetchImpl = globalThis.fetch } = {}) {
    if (!baseUrl || typeof baseUrl !== "string") {
      throw new TypeError("baseUrl must be a non-empty string");
    }
    if (!apiKey || typeof apiKey !== "string") {
      throw new TypeError("apiKey must be a non-empty string");
    }
    if (typeof fetchImpl !== "function") {
      throw new TypeError("fetch implementation is required");
    }

    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }

  createDatabase(name) {
    return this.request("/api/v1/databases", {
      method: "POST",
      body: { name },
    });
  }

  listDatabases() {
    return this.request("/api/v1/databases");
  }

  deleteDatabase(database) {
    return this.request(`/api/v1/${encodeSegment(database)}`, {
      method: "DELETE",
    });
  }

  createCollection(database, name) {
    return this.request(`/api/v1/${encodeSegment(database)}/collections`, {
      method: "POST",
      body: { name },
    });
  }

  listCollections(database) {
    return this.request(`/api/v1/${encodeSegment(database)}/collections`);
  }

  deleteCollection(database, collection) {
    return this.request(`/api/v1/${encodeSegment(database)}/collections/${encodeSegment(collection)}`, {
      method: "DELETE",
    });
  }

  createDocument(database, collection, document) {
    return this.request(`/api/v1/${encodeSegment(database)}/${encodeSegment(collection)}`, {
      method: "POST",
      body: document,
    });
  }

  listDocuments(database, collection) {
    return this.request(`/api/v1/${encodeSegment(database)}/${encodeSegment(collection)}`);
  }

  getDocument(database, collection, id) {
    return this.request(`/api/v1/${encodeSegment(database)}/${encodeSegment(collection)}/${encodeSegment(id)}`);
  }

  putDocument(database, collection, id, document) {
    return this.request(`/api/v1/${encodeSegment(database)}/${encodeSegment(collection)}/${encodeSegment(id)}`, {
      method: "PUT",
      body: document,
    });
  }

  deleteDocument(database, collection, id) {
    return this.request(`/api/v1/${encodeSegment(database)}/${encodeSegment(collection)}/${encodeSegment(id)}`, {
      method: "DELETE",
    });
  }

  async request(path, { method = "GET", body = undefined } = {}) {
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    const options = { method, headers };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, options);
    } catch (error) {
      throw new JSONVaultError("Could not reach JSONVault", {
        code: "network_error",
        details: error,
      });
    }

    const payload = await readJSON(response);
    if (!response.ok) {
      const apiError = payload?.error;
      throw new JSONVaultError(apiError?.message || response.statusText || "JSONVault request failed", {
        status: response.status,
        code: apiError?.code || "request_failed",
        details: payload,
      });
    }

    return payload;
  }
}

async function readJSON(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new JSONVaultError("JSONVault returned invalid JSON", {
      status: response.status,
      code: "invalid_response",
      details: error,
    });
  }
}

function encodeSegment(value) {
  if (!value || typeof value !== "string") {
    throw new TypeError("path segment must be a non-empty string");
  }
  return encodeURIComponent(value);
}
