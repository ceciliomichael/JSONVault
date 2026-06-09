import { getProjectCoreClientConfig } from "@/lib/core";
import { getSelectedDashboardProject } from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ database: string; collection: string }> },
) {
  try {
    const session = await requireDashboardSession();
    const project = await getSelectedDashboardProject(session);
    const { database, collection } = await params;

    if (!project || project.database !== database) {
      return new Response("Unauthorized or invalid project context", {
        status: 401,
      });
    }

    const config = getProjectCoreClientConfig(project.database);

    const url = new URL(request.url);
    const lastEventId =
      url.searchParams.get("last_event_id") ||
      request.headers.get("Last-Event-ID");

    let backendUrl = `${config.apiBaseUrl}/api/v1/${encodeURIComponent(database)}/${encodeURIComponent(collection)}/subscribe`;
    if (lastEventId) {
      backendUrl += `?last_event_id=${encodeURIComponent(lastEventId)}`;
    }

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "text/event-stream",
      },
    });

    if (!response.ok) {
      return new Response(`Backend returned ${response.status}`, {
        status: response.status,
      });
    }

    // Set headers for SSE
    const headers = new Headers(response.headers);
    headers.set("Content-Type", "text/event-stream");
    headers.set("Cache-Control", "no-cache");
    headers.set("Connection", "keep-alive");

    return new Response(response.body, {
      headers,
    });
  } catch (error) {
    console.error("SSE Proxy Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
