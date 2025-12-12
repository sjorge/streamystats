import { Hono } from "hono";
import { getJobQueue, JobTypes } from "../jobs/queue";
import { JELLYFIN_JOB_NAMES } from "../jellyfin/workers";
import {
  db,
  servers,
  activities,
  users,
  libraries,
  jobResults,
  type JobResult,
} from "@streamystats/database";
import { activityScheduler } from "../jobs/scheduler";
import { sessionPoller } from "../jobs/session-poller";
import { eq, desc, and, sql } from "drizzle-orm";
import type { JobStatus } from "../types/job-status";

const app = new Hono();

function toIsoUtcMicros(date: Date): string {
  // Date only has millisecond precision; we pad to microseconds to satisfy the project timestamp format.
  return date.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

async function cancelJobsByName(
  jobName: string,
  serverId?: number
): Promise<number> {
  try {
    const boss = await getJobQueue();

    const serverFilter =
      typeof serverId === "number"
        ? sql`and (data->>'serverId')::int = ${serverId}`
        : sql``;

    const rows = (await db.execute(
      sql`
        select id
        from pgboss.job
        where
          name = ${jobName}
          and state < 'completed'
          ${serverFilter}
      `
    )) as unknown as Array<{ id: string }>;

    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      return 0;
    }

    await boss.cancel(ids);
    return ids.length;
  } catch (error) {
    console.error(`Error stopping jobs of type "${jobName}":`, error);
    throw new Error(`Failed to stop jobs of type "${jobName}": ${error}`);
  }
}

app.post("/add-server", async (c) => {
  try {
    const { name, url, apiKey } = await c.req.json();

    if (!name || !url || !apiKey) {
      return c.json({ error: "Name, URL, and API key are required" }, 400);
    }

    const boss = await getJobQueue();
    const jobId = await boss.send(JobTypes.ADD_SERVER, { name, url, apiKey });

    return c.json({
      success: true,
      jobId,
      message: "Add server job queued successfully",
    });
  } catch (error) {
    console.error("Error queuing add server job:", error);
    return c.json({ error: "Failed to queue job" }, 500);
  }
});

app.post("/sync-server-data", async (c) => {
  try {
    const { serverId, endpoint } = await c.req.json();

    if (!serverId || !endpoint) {
      return c.json({ error: "Server ID and endpoint are required" }, 400);
    }

    const validEndpoints = [
      "Users",
      "Library/VirtualFolders",
      "System/ActivityLog",
    ];
    if (!validEndpoints.includes(endpoint)) {
      return c.json(
        {
          error: `Invalid endpoint. Must be one of: ${validEndpoints.join(
            ", "
          )}`,
        },
        400
      );
    }

    const boss = await getJobQueue();
    const jobId = await boss.send(JobTypes.SYNC_SERVER_DATA, {
      serverId,
      endpoint,
    });

    return c.json({
      success: true,
      jobId,
      message: `Sync ${endpoint} job queued successfully`,
    });
  } catch (error) {
    console.error("Error queuing sync server data job:", error);
    return c.json({ error: "Failed to queue job" }, 500);
  }
});

app.post("/start-embedding", async (c) => {
  try {
    const { serverId } = await c.req.json();

    if (!serverId) {
      return c.json({ error: "Server ID is required" }, 400);
    }

    const server = await db
      .select()
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);

    if (!server.length) {
      return c.json({ error: "Server not found" }, 404);
    }

    const serverConfig = server[0];

    if (!serverConfig.embeddingProvider) {
      return c.json(
        {
          error:
            "Embedding provider not configured. Please configure it in server settings.",
        },
        400
      );
    }

    if (!serverConfig.embeddingBaseUrl || !serverConfig.embeddingModel) {
      return c.json(
        {
          error:
            "Embedding configuration incomplete. Please set base URL and model.",
        },
        400
      );
    }

    if (
      serverConfig.embeddingProvider === "openai-compatible" &&
      !serverConfig.embeddingApiKey
    ) {
      return c.json(
        { error: "API key is required for OpenAI-compatible providers" },
        400
      );
    }

    const boss = await getJobQueue();
    const jobId = await boss.send("generate-item-embeddings", {
      serverId,
      provider: serverConfig.embeddingProvider,
      config: {
        baseUrl: serverConfig.embeddingBaseUrl,
        apiKey: serverConfig.embeddingApiKey,
        model: serverConfig.embeddingModel,
        dimensions: serverConfig.embeddingDimensions || 1536,
      },
    });

    return c.json({
      success: true,
      jobId,
      message: "Embedding generation job started successfully",
    });
  } catch (error) {
    console.error("Error starting embedding job:", error);
    return c.json({ error: "Failed to start embedding job" }, 500);
  }
});

app.post("/stop-embedding", async (c) => {
  try {
    const { serverId } = await c.req.json();

    if (!serverId) {
      return c.json({ error: "Server ID is required" }, 400);
    }

    const cancelledCount = await cancelJobsByName(
      "generate-item-embeddings",
      serverId
    );

    return c.json({
      success: true,
      message: `Embedding jobs stopped successfully. ${cancelledCount} jobs cancelled.`,
      cancelledCount,
    });
  } catch (error) {
    console.error("Error stopping embedding job:", error);
    return c.json(
      {
        error: "Failed to stop embedding job",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

app.post("/cancel-by-type", async (c) => {
  try {
    const { jobType, serverId } = await c.req.json();

    if (!jobType) {
      return c.json({ error: "Job type is required" }, 400);
    }

    const validJobTypes = [
      JobTypes.SYNC_SERVER_DATA,
      JobTypes.ADD_SERVER,
      JobTypes.GENERATE_ITEM_EMBEDDINGS,
      JobTypes.SEQUENTIAL_SERVER_SYNC,
      ...Object.values(JELLYFIN_JOB_NAMES),
    ];

    if (!validJobTypes.includes(jobType)) {
      return c.json(
        { error: "Invalid job type", validTypes: validJobTypes },
        400
      );
    }

    const cancelledCount = await cancelJobsByName(jobType, serverId);

    return c.json({
      success: true,
      message: `Jobs of type "${jobType}" cancelled successfully. ${cancelledCount} jobs cancelled.`,
      cancelledCount,
      jobType,
      serverId: serverId || null,
    });
  } catch (error) {
    console.error("Error cancelling jobs by type:", error);
    return c.json(
      {
        error: "Failed to cancel jobs",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

app.get("/servers", async (c) => {
  try {
    const serversList = await db
      .select()
      .from(servers)
      .orderBy(desc(servers.createdAt));

    return c.json({
      success: true,
      servers: serversList,
      count: serversList.length,
    });
  } catch (error) {
    console.error("Error fetching servers:", error);
    return c.json({ error: "Failed to fetch servers" }, 500);
  }
});

app.get("/servers/:serverId/users", async (c) => {
  try {
    const serverId = c.req.param("serverId");
    const usersList = await db
      .select()
      .from(users)
      .where(eq(users.serverId, parseInt(serverId)))
      .orderBy(desc(users.createdAt));

    return c.json({
      success: true,
      users: usersList,
      count: usersList.length,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return c.json({ error: "Failed to fetch users" }, 500);
  }
});

app.get("/servers/:serverId/libraries", async (c) => {
  try {
    const serverId = c.req.param("serverId");
    const librariesList = await db
      .select()
      .from(libraries)
      .where(eq(libraries.serverId, parseInt(serverId)))
      .orderBy(desc(libraries.createdAt));

    return c.json({
      success: true,
      libraries: librariesList,
      count: librariesList.length,
    });
  } catch (error) {
    console.error("Error fetching libraries:", error);
    return c.json({ error: "Failed to fetch libraries" }, 500);
  }
});

app.get("/servers/:serverId/activities", async (c) => {
  try {
    const serverId = c.req.param("serverId");
    const limit = parseInt(c.req.query("limit") || "50");

    const activitiesList = await db
      .select()
      .from(activities)
      .where(eq(activities.serverId, parseInt(serverId)))
      .orderBy(desc(activities.date))
      .limit(limit);

    return c.json({
      success: true,
      activities: activitiesList,
      count: activitiesList.length,
    });
  } catch (error) {
    console.error("Error fetching activities:", error);
    return c.json({ error: "Failed to fetch activities" }, 500);
  }
});

type ServerJobState =
  | "running"
  | "queued"
  | "scheduled"
  | "failed"
  | "cancelled"
  | "stopped";

type ServerJobStatusItem = {
  key: string;
  label: string;
  state: ServerJobState;
  updatedAt: string;
  activeSince?: string;
  scheduledFor?: string;
  jobId?: string;
  lastError?: string;
};

app.get("/servers/:serverId/status", async (c) => {
  try {
    const rawServerId = c.req.param("serverId");
    const serverId = Number(rawServerId);

    if (!Number.isFinite(serverId)) {
      return c.json({ error: "Invalid serverId" }, 400);
    }

    const jobDefinitions: Array<{
      key: string;
      label: string;
      name: string;
      category: "foreground" | "background";
    }> = [
      {
        key: "sequential-server-sync",
        label: "Server sync",
        name: JobTypes.SEQUENTIAL_SERVER_SYNC,
        category: "foreground",
      },
      {
        key: "generate-item-embeddings",
        label: "Embeddings",
        name: JobTypes.GENERATE_ITEM_EMBEDDINGS,
        category: "foreground",
      },
      {
        key: "jellyfin-full-sync",
        label: "Jellyfin full sync",
        name: JELLYFIN_JOB_NAMES.FULL_SYNC,
        category: "background",
      },
      {
        key: "jellyfin-users-sync",
        label: "Jellyfin users",
        name: JELLYFIN_JOB_NAMES.USERS_SYNC,
        category: "background",
      },
      {
        key: "jellyfin-libraries-sync",
        label: "Jellyfin libraries",
        name: JELLYFIN_JOB_NAMES.LIBRARIES_SYNC,
        category: "background",
      },
      {
        key: "jellyfin-items-sync",
        label: "Jellyfin items",
        name: JELLYFIN_JOB_NAMES.ITEMS_SYNC,
        category: "background",
      },
      {
        key: "jellyfin-activities-sync",
        label: "Jellyfin activities",
        name: JELLYFIN_JOB_NAMES.ACTIVITIES_SYNC,
        category: "background",
      },
      {
        key: "jellyfin-recent-items-sync",
        label: "Jellyfin recent items",
        name: JELLYFIN_JOB_NAMES.RECENT_ITEMS_SYNC,
        category: "background",
      },
      {
        key: "jellyfin-recent-activities-sync",
        label: "Jellyfin recent activities",
        name: JELLYFIN_JOB_NAMES.RECENT_ACTIVITIES_SYNC,
        category: "background",
      },
    ];

    const jobNames = jobDefinitions.map((j) => j.name);
    const jobNameList = sql.join(
      jobNames.map((n) => sql`${n}`),
      sql`, `
    );

    const rows = (await db.execute(
      sql`
        with base as (
          select
            name,
            id,
            state,
            createdon,
            startedon,
            startafter,
            completedon,
            output
          from pgboss.job
          where
            name in (${jobNameList})
            and (data->>'serverId')::int = ${serverId}
        ),
        flags as (
          select
            name,
            bool_or(state = 'active') as has_active,
            bool_or(state in ('created', 'retry')) as has_queued
          from base
          group by name
        ),
        latest as (
          select distinct on (name)
            name,
            id as latest_id,
            state as latest_state,
            createdon as latest_createdon,
            completedon as latest_completedon,
            output as latest_output
          from base
          order by name, createdon desc
        ),
        active as (
          select distinct on (name)
            name,
            id as active_id,
            startedon as active_startedon
          from base
          where state = 'active'
          order by name, startedon desc
        ),
        queued as (
          select distinct on (name)
            name,
            id as queued_id,
            createdon as queued_createdon,
            startafter as queued_startafter
          from base
          where state in ('created', 'retry')
          order by name, createdon desc
        )
        select
          latest.name,
          flags.has_active,
          flags.has_queued,
          latest.latest_state,
          latest.latest_id,
          latest.latest_createdon,
          latest.latest_completedon,
          latest.latest_output,
          active.active_id,
          active.active_startedon,
          queued.queued_id,
          queued.queued_createdon,
          queued.queued_startafter
        from latest
        join flags using (name)
        left join active using (name)
        left join queued using (name)
      `
    )) as unknown as Array<{
      name: string;
      has_active: boolean;
      has_queued: boolean;
      latest_state:
        | "created"
        | "retry"
        | "active"
        | "completed"
        | "expired"
        | "cancelled"
        | "failed";
      latest_id: string;
      latest_createdon: Date;
      latest_completedon: Date | null;
      latest_output: unknown;
      active_id: string | null;
      active_startedon: Date | null;
      queued_id: string | null;
      queued_createdon: Date | null;
      queued_startafter: Date | null;
    }>;

    const byName = new Map(rows.map((r) => [r.name, r]));

    const jobs: ServerJobStatusItem[] = jobDefinitions.map((def) => {
      const row = byName.get(def.name);
      if (!row) {
        return {
          key: def.key,
          label: def.label,
          state: "stopped",
          updatedAt: toIsoUtcMicros(new Date()),
        };
      }

      let state: ServerJobState = "stopped";
      let jobId: string | undefined;

      if (row.has_active) {
        state = "running";
        jobId = row.active_id ?? row.latest_id;
      } else if (row.has_queued) {
        const startAfter = row.queued_startafter
          ? new Date(row.queued_startafter).getTime()
          : undefined;
        state = startAfter && startAfter > Date.now() ? "scheduled" : "queued";
        jobId = row.queued_id ?? row.latest_id;
      } else if (
        row.latest_state === "failed" ||
        row.latest_state === "expired"
      ) {
        state = "failed";
      } else if (row.latest_state === "cancelled") {
        state = "cancelled";
      } else {
        state = "stopped";
      }

      const updatedAtSource =
        row.active_startedon ??
        row.queued_startafter ??
        row.queued_createdon ??
        row.latest_completedon ??
        row.latest_createdon;

      let lastError: string | undefined;
      if (
        state === "failed" &&
        row.latest_output &&
        typeof row.latest_output === "object"
      ) {
        const output = row.latest_output as Record<string, unknown>;
        const message =
          typeof output.message === "string"
            ? output.message
            : typeof output.error === "string"
            ? output.error
            : undefined;
        lastError = message;
      }

      return {
        key: def.key,
        label: def.label,
        state,
        updatedAt: toIsoUtcMicros(new Date(updatedAtSource)),
        ...(state === "running" && row.active_startedon
          ? { activeSince: toIsoUtcMicros(new Date(row.active_startedon)) }
          : {}),
        ...(state === "scheduled" && row.queued_startafter
          ? { scheduledFor: toIsoUtcMicros(new Date(row.queued_startafter)) }
          : {}),
        ...(jobId ? { jobId } : {}),
        ...(lastError ? { lastError } : {}),
      };
    });

    return c.json({
      success: true,
      timestamp: toIsoUtcMicros(new Date()),
      serverId,
      jobs,
    });
  } catch (error) {
    console.error("Error fetching server job status:", error);
    return c.json(
      {
        error: "Failed to fetch server job status",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

app.get("/:jobId/status", async (c) => {
  try {
    const jobId = c.req.param("jobId");

    const boss = await getJobQueue();
    const job = await boss.getJobById(jobId);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    return c.json({
      success: true,
      job: {
        id: job.id,
        name: job.name,
        state: job.state,
        data: job.data,
        output: job.output,
        createdon: job.createdon,
        startedon: job.startedon,
        completedon: job.completedon,
      },
    });
  } catch (error) {
    console.error("Error fetching job status:", error);
    return c.json({ error: "Failed to fetch job status" }, 500);
  }
});

app.get("/results", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "20");
    const status = c.req.query("status");
    const jobName = c.req.query("jobName");

    if (status) {
      const results = await db
        .select()
        .from(jobResults)
        .where(eq(jobResults.status, status))
        .orderBy(desc(jobResults.createdAt))
        .limit(limit);

      return c.json({ success: true, results, count: results.length });
    }

    if (jobName) {
      const results = await db
        .select()
        .from(jobResults)
        .where(eq(jobResults.jobName, jobName))
        .orderBy(desc(jobResults.createdAt))
        .limit(limit);

      return c.json({ success: true, results, count: results.length });
    }

    const results = await db
      .select()
      .from(jobResults)
      .orderBy(desc(jobResults.createdAt))
      .limit(limit);

    return c.json({ success: true, results, count: results.length });
  } catch (error) {
    console.error("Error fetching job results:", error);
    return c.json({ error: "Failed to fetch job results" }, 500);
  }
});

app.get("/queue/stats", async (c) => {
  try {
    const boss = await getJobQueue();

    const stats = await Promise.all([
      boss.getQueueSize(JobTypes.SYNC_SERVER_DATA),
      boss.getQueueSize(JobTypes.ADD_SERVER),
      boss.getQueueSize(JobTypes.GENERATE_ITEM_EMBEDDINGS),
      boss.getQueueSize(JobTypes.SEQUENTIAL_SERVER_SYNC),
    ]);

    return c.json({
      success: true,
      queueStats: {
        syncServerData: stats[0],
        addServer: stats[1],
        generateItemEmbeddings: stats[2],
        sequentialServerSync: stats[3],
        total: stats.reduce((sum: number, stat: number) => sum + stat, 0),
      },
    });
  } catch (error) {
    console.error("Error fetching queue stats:", error);
    return c.json({ error: "Failed to fetch queue stats" }, 500);
  }
});

app.post("/test/add-test-server", async (c) => {
  try {
    const boss = await getJobQueue();
    const jobId = await boss.send(JobTypes.ADD_SERVER, {
      name: "Test Jellyfin Server",
      url: "http://localhost:8096",
      apiKey: "test-api-key",
    });

    return c.json({
      success: true,
      jobId,
      message: "Test server addition job queued",
    });
  } catch (error) {
    console.error("Error queuing test server job:", error);
    return c.json({ error: "Failed to queue test job" }, 500);
  }
});

app.post("/create-server", async (c) => {
  console.log("[create-server] Starting server creation process");
  try {
    const body = await c.req.json();
    const { name, url, apiKey, ...otherFields } = body;
    console.log("[create-server] Received request:", {
      name,
      url,
      apiKey: "[REDACTED]",
      otherFields,
    });

    if (!name || !url || !apiKey) {
      console.warn("[create-server] Missing required fields:", {
        name: !!name,
        url: !!url,
        apiKey: !!apiKey,
      });
      return c.json({ error: "Name, URL, and API key are required" }, 400);
    }

    try {
      console.log("[create-server] Testing connection to server:", url);
      const testResponse = await fetch(`${url}/System/Info`, {
        headers: {
          "X-Emby-Token": apiKey,
          "Content-Type": "application/json",
        },
      });

      if (!testResponse.ok) {
        console.error("[create-server] Server connection failed:", {
          status: testResponse.status,
          statusText: testResponse.statusText,
          url,
        });

        let errorMessage = "Failed to connect to server.";
        if (testResponse.status === 401) {
          errorMessage = "Invalid API key. Please check your Jellyfin API key.";
        } else if (testResponse.status === 404) {
          errorMessage = "Server not found. Please check the URL.";
        } else if (testResponse.status === 403) {
          errorMessage =
            "Access denied. Please check your API key permissions.";
        } else if (testResponse.status >= 500) {
          errorMessage =
            "Server error. Please check if Jellyfin server is running properly.";
        } else {
          errorMessage = `Failed to connect to server (${testResponse.status}). Please check URL and API key.`;
        }

        return c.json({ error: errorMessage }, 400);
      }

      const serverInfo = (await testResponse.json()) as {
        ServerName?: string;
        Version?: string;
        ProductName?: string;
        OperatingSystem?: string;
        StartupWizardCompleted?: boolean;
      };

      console.log(
        "[create-server] Checking for existing server with URL:",
        url
      );
      const existingServer = await db
        .select({ id: servers.id, name: servers.name })
        .from(servers)
        .where(eq(servers.url, url))
        .limit(1);

      if (existingServer.length > 0) {
        console.warn("[create-server] Server with this URL already exists:", {
          existingServerId: existingServer[0].id,
          existingServerName: existingServer[0].name,
          url,
        });
        return c.json(
          {
            error: "A server with this URL already exists",
            existingServer: existingServer[0],
          },
          409
        );
      }

      const newServer = {
        name: serverInfo.ServerName || name,
        url,
        apiKey,
        version: serverInfo.Version,
        productName: serverInfo.ProductName,
        operatingSystem: serverInfo.OperatingSystem,
        startupWizardCompleted: serverInfo.StartupWizardCompleted || false,
        syncStatus: "pending" as const,
        syncProgress: "not_started" as const,
        ...otherFields,
      };

      const [createdServer] = await db
        .insert(servers)
        .values(newServer)
        .returning();

      const boss = await getJobQueue();
      const jobId = await boss.send(JobTypes.SEQUENTIAL_SERVER_SYNC, {
        serverId: createdServer.id,
      });

      return c.json(
        {
          success: true,
          server: createdServer,
          syncJobId: jobId,
          message: "Server created successfully. Sync has been started.",
        },
        201
      );
    } catch (connectionError) {
      console.error("[create-server] Connection error:", {
        error:
          connectionError instanceof Error
            ? connectionError.message
            : String(connectionError),
        stack:
          connectionError instanceof Error ? connectionError.stack : undefined,
        url,
      });
      let errorMessage = "Failed to connect to server.";

      if (connectionError instanceof Error) {
        const message = connectionError.message.toLowerCase();
        if (
          message.includes("fetch failed") ||
          message.includes("econnrefused")
        ) {
          errorMessage =
            "Cannot reach server. Please check the URL and ensure the server is running.";
        } else if (
          message.includes("getaddrinfo notfound") ||
          message.includes("dns")
        ) {
          errorMessage = "Server hostname not found. Please check the URL.";
        } else if (message.includes("timeout")) {
          errorMessage =
            "Connection timeout. Please check the URL and server status.";
        } else if (
          message.includes("certificate") ||
          message.includes("ssl") ||
          message.includes("tls")
        ) {
          errorMessage =
            "SSL/TLS certificate error. Please verify the server's certificate.";
        } else {
          errorMessage = `Connection failed: ${connectionError.message}`;
        }
      }

      return c.json({ error: errorMessage }, 400);
    }
  } catch (error) {
    console.error("[create-server] Unexpected error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return c.json(
      {
        error: "Failed to create server",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

app.get("/servers/:serverId/sync-status", async (c) => {
  try {
    const serverId = c.req.param("serverId");

    const server = await db
      .select({
        id: servers.id,
        name: servers.name,
        syncStatus: servers.syncStatus,
        syncProgress: servers.syncProgress,
        syncError: servers.syncError,
        lastSyncStarted: servers.lastSyncStarted,
        lastSyncCompleted: servers.lastSyncCompleted,
      })
      .from(servers)
      .where(eq(servers.id, parseInt(serverId)))
      .limit(1);

    if (!server.length) {
      return c.json({ error: "Server not found" }, 404);
    }

    const serverData = server[0];

    const progressSteps = [
      "not_started",
      "users",
      "libraries",
      "items",
      "activities",
      "completed",
    ];
    const currentStepIndex = progressSteps.indexOf(serverData.syncProgress);
    const progressPercentage =
      currentStepIndex >= 0
        ? (currentStepIndex / (progressSteps.length - 1)) * 100
        : 0;

    const isReady =
      serverData.syncStatus === "completed" &&
      serverData.syncProgress === "completed";

    return c.json({
      success: true,
      server: {
        ...serverData,
        progressPercentage: Math.round(progressPercentage),
        isReady,
        canRedirect: isReady,
      },
    });
  } catch (error) {
    console.error("Error getting sync status:", error);
    return c.json(
      {
        error: "Failed to get sync status",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

app.get("/scheduler/status", async (c) => {
  try {
    const status = activityScheduler.getStatus();
    return c.json({ success: true, scheduler: status });
  } catch (error) {
    console.error("Error getting scheduler status:", error);
    return c.json({ error: "Failed to get scheduler status" }, 500);
  }
});

app.post("/scheduler/trigger", async (c) => {
  try {
    const { serverId } = await c.req.json();

    if (!serverId) {
      return c.json({ error: "Server ID is required" }, 400);
    }

    const server = await db
      .select({ id: servers.id, name: servers.name })
      .from(servers)
      .where(eq(servers.id, parseInt(serverId)))
      .limit(1);

    if (!server.length) {
      return c.json({ error: "Server not found" }, 404);
    }

    await activityScheduler.triggerServerActivitySync(parseInt(serverId));

    return c.json({
      success: true,
      message: `Activity sync triggered for server: ${server[0].name}`,
    });
  } catch (error) {
    console.error("Error triggering activity sync:", error);
    return c.json({ error: "Failed to trigger activity sync" }, 500);
  }
});

app.post("/scheduler/trigger-user-sync", async (c) => {
  try {
    const { serverId } = await c.req.json();

    if (!serverId) {
      return c.json({ error: "Server ID is required" }, 400);
    }

    const server = await db
      .select({ id: servers.id, name: servers.name })
      .from(servers)
      .where(eq(servers.id, parseInt(serverId)))
      .limit(1);

    if (!server.length) {
      return c.json({ error: "Server not found" }, 404);
    }

    await activityScheduler.triggerServerUserSync(parseInt(serverId));

    return c.json({
      success: true,
      message: `User sync triggered for server: ${server[0].name}`,
    });
  } catch (error) {
    console.error("Error triggering user sync:", error);
    return c.json({ error: "Failed to trigger user sync" }, 500);
  }
});

app.post("/scheduler/trigger-full-sync", async (c) => {
  try {
    const { serverId } = await c.req.json();

    if (!serverId) {
      return c.json({ error: "Server ID is required" }, 400);
    }

    const server = await db
      .select({ id: servers.id, name: servers.name })
      .from(servers)
      .where(eq(servers.id, parseInt(serverId)))
      .limit(1);

    if (!server.length) {
      return c.json({ error: "Server not found" }, 404);
    }

    await activityScheduler.triggerServerFullSync(parseInt(serverId));

    return c.json({
      success: true,
      message: `Full sync triggered for server: ${server[0].name}`,
    });
  } catch (error) {
    console.error("Error triggering full sync:", error);
    return c.json({ error: "Failed to trigger full sync" }, 500);
  }
});

app.post("/scheduler/config", async (c) => {
  try {
    const body = await c.req.json();
    const {
      activitySyncInterval,
      recentItemsSyncInterval,
      userSyncInterval,
      fullSyncInterval,
      enabled,
    } = body;

    const config: Record<string, string | boolean> = {};

    const isValidCron = (expr: string) =>
      /^(\*|[0-9,-/\*]+)\s+(\*|[0-9,-/\*]+)\s+(\*|[0-9,-/\*]+)\s+(\*|[0-9,-/\*]+)\s+(\*|[0-9,-/\*]+)$/.test(
        expr
      );

    if (typeof activitySyncInterval === "string") {
      if (!isValidCron(activitySyncInterval)) {
        return c.json(
          { error: "Invalid activity sync cron expression format" },
          400
        );
      }
      config.activitySyncInterval = activitySyncInterval;
    }

    if (typeof recentItemsSyncInterval === "string") {
      if (!isValidCron(recentItemsSyncInterval)) {
        return c.json(
          { error: "Invalid recent items sync cron expression format" },
          400
        );
      }
      config.recentItemsSyncInterval = recentItemsSyncInterval;
    }

    if (typeof userSyncInterval === "string") {
      if (!isValidCron(userSyncInterval)) {
        return c.json(
          { error: "Invalid user sync cron expression format" },
          400
        );
      }
      config.userSyncInterval = userSyncInterval;
    }

    if (typeof fullSyncInterval === "string") {
      if (!isValidCron(fullSyncInterval)) {
        return c.json(
          { error: "Invalid full sync cron expression format" },
          400
        );
      }
      config.fullSyncInterval = fullSyncInterval;
    }

    if (typeof enabled === "boolean") {
      config.enabled = enabled;
    }

    if (Object.keys(config).length === 0) {
      return c.json({ error: "No valid configuration provided" }, 400);
    }

    activityScheduler.updateConfig(config);
    const newStatus = activityScheduler.getStatus();

    return c.json({
      success: true,
      message: "Scheduler configuration updated",
      scheduler: newStatus,
    });
  } catch (error) {
    console.error("Error updating scheduler config:", error);
    return c.json({ error: "Failed to update scheduler configuration" }, 500);
  }
});

app.get("/server-status", async (c) => {
  try {
    const boss = await getJobQueue();

    const queueSizes = await Promise.all([
      boss.getQueueSize(JobTypes.SYNC_SERVER_DATA),
      boss.getQueueSize(JobTypes.ADD_SERVER),
      boss.getQueueSize(JobTypes.GENERATE_ITEM_EMBEDDINGS),
      boss.getQueueSize(JobTypes.SEQUENTIAL_SERVER_SYNC),
    ]);

    const jellyfinQueueSizes = await Promise.all([
      boss.getQueueSize(JELLYFIN_JOB_NAMES.FULL_SYNC),
      boss.getQueueSize(JELLYFIN_JOB_NAMES.USERS_SYNC),
      boss.getQueueSize(JELLYFIN_JOB_NAMES.LIBRARIES_SYNC),
      boss.getQueueSize(JELLYFIN_JOB_NAMES.ITEMS_SYNC),
      boss.getQueueSize(JELLYFIN_JOB_NAMES.ACTIVITIES_SYNC),
      boss.getQueueSize(JELLYFIN_JOB_NAMES.RECENT_ITEMS_SYNC),
      boss.getQueueSize(JELLYFIN_JOB_NAMES.RECENT_ACTIVITIES_SYNC),
      boss.getQueueSize(JELLYFIN_JOB_NAMES.PEOPLE_SYNC),
    ]);

    const allServers = await db
      .select({
        id: servers.id,
        name: servers.name,
        url: servers.url,
        syncStatus: servers.syncStatus,
        syncProgress: servers.syncProgress,
        syncError: servers.syncError,
        lastSyncStarted: servers.lastSyncStarted,
        lastSyncCompleted: servers.lastSyncCompleted,
        createdAt: servers.createdAt,
        updatedAt: servers.updatedAt,
      })
      .from(servers);

    const schedulerStatus = activityScheduler.getStatus();
    const sessionPollerStatus = sessionPoller.getStatus();

    const recentJobResults = await db
      .select()
      .from(jobResults)
      .orderBy(desc(jobResults.createdAt))
      .limit(10);

    const jobStatusMap: Record<string, JobStatus> = {};

    const dbJobResults = await db
      .select()
      .from(jobResults)
      .orderBy(desc(jobResults.createdAt))
      .limit(100);

    const jobGroups: Record<string, { status: JobStatus; createdAt: Date }> =
      {};

    for (const result of dbJobResults) {
      const resultJobName = result.jobName;
      const resultDate = new Date(result.createdAt);

      if (
        !jobGroups[resultJobName] ||
        resultDate > jobGroups[resultJobName].createdAt
      ) {
        jobGroups[resultJobName] = {
          status: result.status as JobStatus,
          createdAt: resultDate,
        };
      }
    }

    for (const [resultJobName, jobInfo] of Object.entries(jobGroups)) {
      jobStatusMap[resultJobName] = jobInfo.status;
    }

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      queueStats: {
        syncServerData: queueSizes[0],
        addServer: queueSizes[1],
        generateItemEmbeddings: queueSizes[2],
        sequentialServerSync: queueSizes[3],
        jellyfinFullSync: jellyfinQueueSizes[0],
        jellyfinUsersSync: jellyfinQueueSizes[1],
        jellyfinLibrariesSync: jellyfinQueueSizes[2],
        jellyfinItemsSync: jellyfinQueueSizes[3],
        jellyfinActivitiesSync: jellyfinQueueSizes[4],
        jellyfinRecentItemsSync: jellyfinQueueSizes[5],
        jellyfinRecentActivitiesSync: jellyfinQueueSizes[6],
        jellyfinPeopleSync: jellyfinQueueSizes[7],
        totalQueued: [...queueSizes, ...jellyfinQueueSizes].reduce(
          (sum, stat) => sum + stat,
          0
        ),
        standardJobsQueued: queueSizes.reduce((sum, stat) => sum + stat, 0),
        jellyfinJobsQueued: jellyfinQueueSizes.reduce(
          (sum, stat) => sum + stat,
          0
        ),
      },
      jobStatusMap,
      servers: {
        total: allServers.length,
        byStatus: {
          pending: allServers.filter((s) => s.syncStatus === "pending").length,
          syncing: allServers.filter((s) => s.syncStatus === "syncing").length,
          completed: allServers.filter((s) => s.syncStatus === "completed")
            .length,
          failed: allServers.filter((s) => s.syncStatus === "failed").length,
        },
        list: allServers.map((server) => ({
          id: server.id,
          name: server.name,
          url: server.url,
          syncStatus: server.syncStatus,
          syncProgress: server.syncProgress,
          syncError: server.syncError,
          lastSyncStarted: server.lastSyncStarted,
          lastSyncCompleted: server.lastSyncCompleted,
          isHealthy: server.syncStatus !== "failed",
          needsAttention:
            server.syncStatus === "failed" ||
            (server.syncStatus === "syncing" &&
              server.lastSyncStarted &&
              Date.now() - new Date(server.lastSyncStarted).getTime() >
                30 * 60 * 1000),
        })),
      },
      scheduler: {
        ...schedulerStatus,
        healthCheck:
          schedulerStatus.enabled && schedulerStatus.runningTasks.length > 0,
      },
      sessionPoller: {
        ...sessionPollerStatus,
        healthCheck:
          sessionPollerStatus.enabled && sessionPollerStatus.isRunning,
      },
      recentResults: recentJobResults.map((result: JobResult) => ({
        id: result.id,
        jobName: result.jobName,
        status: result.status,
        createdAt: result.createdAt,
        error: result.error,
        processingTime: result.processingTime,
      })),
      systemHealth: {
        overall: "healthy" as "healthy" | "warning" | "unhealthy",
        issues: [] as string[],
        warnings: [] as string[],
      },
    };

    const issues: string[] = [];
    const warnings: string[] = [];

    const failedServers = allServers.filter((s) => s.syncStatus === "failed");
    if (failedServers.length > 0) {
      issues.push(`${failedServers.length} server(s) have failed sync status`);
    }

    const stuckSyncingServers = allServers.filter(
      (s) =>
        s.syncStatus === "syncing" &&
        s.lastSyncStarted &&
        Date.now() - new Date(s.lastSyncStarted).getTime() > 30 * 60 * 1000
    );
    if (stuckSyncingServers.length > 0) {
      warnings.push(
        `${stuckSyncingServers.length} server(s) may be stuck in syncing state`
      );
    }

    if (!schedulerStatus.enabled) {
      issues.push("Activity scheduler is disabled");
    }

    if (!sessionPollerStatus.enabled || !sessionPollerStatus.isRunning) {
      issues.push("Session poller is not running");
    }

    const totalQueuedJobs = response.queueStats.totalQueued;
    if (totalQueuedJobs > 100) {
      warnings.push(`High job queue volume: ${totalQueuedJobs} jobs queued`);
    }

    const recentFailedJobs = recentJobResults.filter(
      (result: JobResult) => result.status === "failed"
    );
    if (recentFailedJobs.length > 5) {
      warnings.push(
        `High number of recent failed jobs: ${recentFailedJobs.length}`
      );
    }

    const failedJobsInMap = Object.values(jobStatusMap).filter(
      (status) => status === "failed"
    ).length;
    if (failedJobsInMap > 10) {
      warnings.push(`High number of failed jobs: ${failedJobsInMap}`);
    }

    response.systemHealth.issues = issues;
    response.systemHealth.warnings = warnings;
    response.systemHealth.overall =
      issues.length > 0
        ? "unhealthy"
        : warnings.length > 0
        ? "warning"
        : "healthy";

    return c.json(response);
  } catch (error) {
    console.error("Error fetching server status:", error);
    return c.json(
      {
        error: "Failed to fetch server status",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

app.post("/cleanup-stale", async (c) => {
  try {
    console.log("Manual cleanup of stale embedding jobs triggered");

    const staleJobs = await db
      .select()
      .from(jobResults)
      .where(
        and(
          eq(jobResults.jobName, "generate-item-embeddings"),
          eq(jobResults.status, "processing"),
          sql`${jobResults.createdAt} < NOW() - INTERVAL '10 minutes'`
        )
      );

    let cleanedCount = 0;

    for (const staleJob of staleJobs) {
      try {
        const result = staleJob.result as Record<string, unknown> | null;
        const serverId = result?.serverId;

        if (serverId) {
          const lastHeartbeat = result?.lastHeartbeat
            ? new Date(result.lastHeartbeat as string).getTime()
            : new Date(staleJob.createdAt).getTime();
          const heartbeatAge = Date.now() - lastHeartbeat;

          if (heartbeatAge > 2 * 60 * 1000) {
            const processingTime = Math.min(
              Date.now() - new Date(staleJob.createdAt).getTime(),
              3600000
            );

            await db
              .update(jobResults)
              .set({
                status: "failed",
                error:
                  "Manual cleanup: Job exceeded maximum processing time without heartbeat",
                processingTime,
                result: {
                  ...result,
                  error:
                    "Manual cleanup - job exceeded maximum processing time",
                  cleanedAt: new Date().toISOString(),
                  staleDuration: heartbeatAge,
                  cleanupType: "manual",
                },
              })
              .where(eq(jobResults.id, staleJob.id));

            cleanedCount++;
            console.log(
              `Manually cleaned up stale embedding job for server ${serverId}`
            );
          }
        }
      } catch (error) {
        console.error("Error cleaning up stale job:", staleJob.jobId, error);
      }
    }

    return c.json({
      success: true,
      message: `Cleanup completed successfully`,
      cleanedJobs: cleanedCount,
      totalStaleJobs: staleJobs.length,
    });
  } catch (error) {
    console.error("Error during manual job cleanup:", error);
    return c.json({ error: "Failed to cleanup stale jobs" }, 500);
  }
});

export default app;
