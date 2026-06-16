import { describe, it, expect, vi } from "vitest";
import { CoreClient } from "./client";
import { createCoreApiError, CoreApiError } from "./errors";

describe("CoreClient", () => {
  const config = { apiBaseUrl: "http://core.local", apiKey: "test-token" };

  it("joins URLs correctly", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = new CoreClient(config, fetchImpl);

    await client.getMe();
    
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://core.local/api/v1/me",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("sends auth headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = new CoreClient(config, fetchImpl);

    await client.getMe();

    const requestInit = fetchImpl.mock.calls[0][1];
    const headers = new Headers(requestInit.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-token");
  });

  it("serializes JSON body correctly", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = new CoreClient(config, fetchImpl);

    await client.createCollection({ database: "db1", collection: "coll1" });

    const requestInit = fetchImpl.mock.calls[0][1];
    const headers = new Headers(requestInit.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(requestInit.body).toBe(JSON.stringify({ name: "coll1" }));
  });

  it("extracts pagination headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Total-Count": "42",
          "X-Limit": "10",
          "X-Offset": "0",
        },
      })
    );
    const client = new CoreClient(config, fetchImpl);

    const result = await client.listDocuments({ database: "db", collection: "coll" });
    expect(result.total).toBe(42);
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(0);
  });

  it("handles ETag in delete/update", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new CoreClient(config, fetchImpl);

    await client.deleteDocument({ database: "db", collection: "coll", id: "doc1", expectedEtag: "etag123" });

    const requestInit = fetchImpl.mock.calls[0][1];
    const headers = new Headers(requestInit.headers);
    expect(headers.get("If-Match")).toBe("etag123");
  });

  it("throws CoreApiError on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Conflict" }), {
        status: 409,
        statusText: "Conflict",
        headers: { "Content-Type": "application/json" }
      })
    );
    const client = new CoreClient(config, fetchImpl);

    await expect(client.createCollection({ database: "db1", collection: "coll1" })).rejects.toThrow("Conflict");
    await expect(client.createCollection({ database: "db1", collection: "coll1" })).rejects.toThrowError(CoreApiError);
  });
});
