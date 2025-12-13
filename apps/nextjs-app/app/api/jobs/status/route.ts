export const dynamic = "force-dynamic";

import { requireAdmin } from "@/lib/api-auth";

export async function GET(request: Request) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const url = new URL(request.url);
    const serverId = url.searchParams.get("serverId");

    if (!serverId) {
      return new Response(JSON.stringify({ error: "serverId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const jobServerUrl =
      process.env.JOB_SERVER_URL && process.env.JOB_SERVER_URL !== "undefined"
        ? process.env.JOB_SERVER_URL
        : "http://localhost:3005";

    const response = await fetch(
      `${jobServerUrl}/api/jobs/servers/${serverId}/status`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error fetching server job status:", err);
    return new Response(
      JSON.stringify({
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch server job status",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}




