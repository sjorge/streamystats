import { db, servers, NewServer } from "@streamystats/database";
import axios from "axios";
import { eq, isNull } from "drizzle-orm";
import { syncUsers, syncLibraries, syncActivities } from "./sync-helpers";
import { logJobResult } from "./job-logger";
import type {
  PgBossJob,
  SyncServerDataJobData,
  AddServerJobData,
} from "../types/job-status";

export const BACKFILL_JOB_NAMES = {
  BACKFILL_JELLYFIN_IDS: "backfill-jellyfin-ids",
} as const;

function log(
  prefix: string,
  data: Record<string, string | number | boolean | null | undefined>
): void {
  const parts = [`[${prefix}]`];
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      parts.push(`${key}=${value}`);
    }
  }
  console.log(parts.join(" "));
}

// Job: Sync server data from external media server API
export async function syncServerDataJob(
  job: PgBossJob<SyncServerDataJobData>,
) {
  const startTime = Date.now();
  const { serverId, endpoint } = job.data;

  try {
    log("sync-server-data", { action: "start", serverId, endpoint });

    // Get server configuration
    const serverData = await db
      .select()
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);
    if (!serverData.length) {
      throw new Error(`Sync server data: Server with ID ${serverId} not found`);
    }

    const server = serverData[0];

    let response;
    let syncedCount = 0;

    // Handle ActivityLog endpoint differently as it needs /Entries suffix
    if (endpoint === "System/ActivityLog") {
      response = await axios.get(`${server.url}/System/ActivityLog/Entries`, {
        headers: {
          "X-Emby-Token": server.apiKey,
          "Content-Type": "application/json",
        },
      });
    } else {
      response = await axios.get(`${server.url}/${endpoint}`, {
        headers: {
          "X-Emby-Token": server.apiKey,
          "Content-Type": "application/json",
        },
      });
    }

    // Handle different endpoint types
    switch (endpoint) {
      case "Users":
        syncedCount = await syncUsers(server.id, response.data);
        break;
      case "Library/VirtualFolders":
        syncedCount = await syncLibraries(server.id, response.data);
        break;
      case "System/ActivityLog":
        syncedCount = await syncActivities(
          server.id,
          response.data.Items || []
        );
        break;
      default:
        throw new Error(`Unknown endpoint: ${endpoint}`);
    }

    const processingTime = Date.now() - startTime;
    await logJobResult(
      job.id,
      "sync-server-data",
      "completed",
      { syncedCount, endpoint },
      processingTime
    );

    return { success: true, syncedCount, endpoint };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    await logJobResult(
      job.id,
      "sync-server-data",
      "failed",
      null,
      processingTime,
      error instanceof Error ? error : String(error)
    );
    throw error;
  }
}

// Job: Add a new media server
export async function addServerJob(job: PgBossJob<AddServerJobData>) {
  const startTime = Date.now();
  const { name, serverUrl, apiKey } = job.data;

  try {
    log("add-server", { action: "start", name });

    // Test server connection
    const response = await axios.get(`${serverUrl}/System/Info`, {
      headers: {
        "X-Emby-Token": apiKey,
        "Content-Type": "application/json",
      },
    });

    const serverInfo = response.data;

    // Create server record
    const newServer: NewServer = {
      name,
      url: serverUrl,
      apiKey,
      jellyfinId: serverInfo.Id,
      lastSyncedPlaybackId: 0,
      localAddress: serverInfo.LocalAddress,
      version: serverInfo.Version,
      productName: serverInfo.ProductName,
      operatingSystem: serverInfo.OperatingSystem,
      startupWizardCompleted: serverInfo.StartupWizardCompleted || false,
      autoGenerateEmbeddings: false,
    };

    const insertedServers = await db
      .insert(servers)
      .values(newServer)
      .returning();
    const processingTime = Date.now() - startTime;

    await logJobResult(
      job.id,
      "add-server",
      "completed",
      insertedServers[0],
      processingTime
    );

    return { success: true, server: insertedServers[0] };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    await logJobResult(
      job.id,
      "add-server",
      "failed",
      null,
      processingTime,
      error instanceof Error ? error : String(error)
    );
    throw error;
  }
}

// Job: Backfill Jellyfin server IDs for existing servers
export async function backfillJellyfinIdsJob(job: PgBossJob<Record<string, never>>) {
  const startTime = Date.now();

  try {
    log("backfill-jellyfin-ids", { action: "start" });

    // Get servers without jellyfinId
    const serversWithoutId = await db
      .select({
        id: servers.id,
        name: servers.name,
        url: servers.url,
        apiKey: servers.apiKey,
      })
      .from(servers)
      .where(isNull(servers.jellyfinId));

    log("backfill-jellyfin-ids", {
      action: "found_servers",
      count: serversWithoutId.length,
    });

    let successCount = 0;
    let errorCount = 0;

    for (const server of serversWithoutId) {
      try {
        const response = await axios.get(`${server.url}/System/Info`, {
          headers: {
            "X-Emby-Token": server.apiKey,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        });

        const jellyfinId = response.data?.Id;
        if (jellyfinId) {
          await db
            .update(servers)
            .set({ jellyfinId })
            .where(eq(servers.id, server.id));

          log("backfill-jellyfin-ids", {
            action: "updated",
            serverId: server.id,
            serverName: server.name,
          });
          successCount++;
        } else {
          log("backfill-jellyfin-ids", {
            action: "no_id_returned",
            serverId: server.id,
            serverName: server.name,
          });
          errorCount++;
        }
      } catch (error) {
        log("backfill-jellyfin-ids", {
          action: "error",
          serverId: server.id,
          serverName: server.name,
        });
        errorCount++;
      }
    }

    const processingTime = Date.now() - startTime;
    await logJobResult(
      job.id,
      "backfill-jellyfin-ids",
      "completed",
      { total: serversWithoutId.length, successCount, errorCount },
      processingTime
    );

    log("backfill-jellyfin-ids", {
      action: "completed",
      total: serversWithoutId.length,
      successCount,
      errorCount,
    });

    return { success: true, total: serversWithoutId.length, successCount, errorCount };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    await logJobResult(
      job.id,
      "backfill-jellyfin-ids",
      "failed",
      null,
      processingTime,
      error instanceof Error ? error : String(error)
    );
    throw error;
  }
}
