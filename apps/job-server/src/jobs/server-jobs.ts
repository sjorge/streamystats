import { db, servers, libraries, NewServer } from "@streamystats/database";
import axios from "axios";
import { eq } from "drizzle-orm";
import {
  syncUsers,
  syncLibraries,
  syncActivities,
  syncItems,
} from "./sync-helpers";
import { logJobResult } from "./job-logger";
import { TIMEOUT_CONFIG } from "./config";

function log(prefix: string, data: Record<string, string | number | boolean | null | undefined>): void {
  const parts = [`[${prefix}]`];
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      parts.push(`${key}=${value}`);
    }
  }
  console.log(parts.join(" "));
}

// Job: Sync server data from external media server API
export async function syncServerDataJob(job: any) {
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
      error
    );
    throw error;
  }
}

// Job: Add a new media server
export async function addServerJob(job: any) {
  const startTime = Date.now();
  const { name, url, apiKey } = job.data;

  try {
    log("add-server", { action: "start", name });

    // Test server connection
    const response = await axios.get(`${url}/System/Info`, {
      headers: {
        "X-Emby-Token": apiKey,
        "Content-Type": "application/json",
      },
    });

    const serverInfo = response.data;

    // Create server record
    const newServer: NewServer = {
      name,
      url,
      apiKey,
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
      error
    );
    throw error;
  }
}

// Job: Sequential server sync - syncs users, libraries, items, and activities in order
export async function sequentialServerSyncJob(job: any) {
  const startTime = Date.now();
  const { serverId } = job.data;

  try {
    log("sequential-sync", { action: "start", serverId });

    // Update server status to syncing
    await db
      .update(servers)
      .set({
        syncStatus: "syncing",
        syncProgress: "users",
        lastSyncStarted: new Date(),
        syncError: null,
      })
      .where(eq(servers.id, serverId));

    // Get server configuration
    const serverData = await db
      .select()
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);

    if (!serverData.length) {
      console.warn(`[sequential-sync] action=skipped serverId=${serverId} reason=server-not-found`);
      const processingTime = Date.now() - startTime;
      await logJobResult(
        job.id,
        "sequential-server-sync",
        "completed",
        { skipped: true, reason: "Server not found" },
        processingTime
      );
      return { success: true, skipped: true, reason: "Server not found" };
    }

    const server = serverData[0];
    const syncResults = {
      users: 0,
      libraries: 0,
      items: 0,
      activities: 0,
    };

    // Step 1: Sync Users
    log("user-sync", { action: "start", serverId });
    try {
      const usersResponse = await axios.get(`${server.url}/Users`, {
        headers: {
          "X-Emby-Token": server.apiKey,
          "Content-Type": "application/json",
        },
        timeout: TIMEOUT_CONFIG.DEFAULT,
      });
      syncResults.users = await syncUsers(serverId, usersResponse.data);
      log("user-sync", { action: "completed", serverId, count: syncResults.users });
    } catch (error) {
      console.error(`[user-sync] action=error serverId=${serverId} error=${error instanceof Error ? error.message : String(error)}`);
      const errorMessage = axios.isAxiosError(error)
        ? `API Error: ${error.response?.status} - ${
            error.response?.statusText || error.message
          }`
        : `Database Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
      throw new Error(`Failed to sync users: ${errorMessage}`);
    }

    // Update progress to libraries
    await db
      .update(servers)
      .set({ syncProgress: "libraries" })
      .where(eq(servers.id, serverId));

    // Step 2: Sync Libraries
    log("library-sync", { action: "start", serverId });
    try {
      const librariesResponse = await axios.get(
        `${server.url}/Library/VirtualFolders`,
        {
          headers: {
            "X-Emby-Token": server.apiKey,
            "Content-Type": "application/json",
          },
          timeout: TIMEOUT_CONFIG.DEFAULT,
        }
      );
      syncResults.libraries = await syncLibraries(
        serverId,
        librariesResponse.data
      );
      log("library-sync", { action: "completed", serverId, count: syncResults.libraries });
    } catch (error) {
      console.error(`[library-sync] action=error serverId=${serverId} error=${error instanceof Error ? error.message : String(error)}`);
      const errorMessage = axios.isAxiosError(error)
        ? `API Error: ${error.response?.status} - ${
            error.response?.statusText || error.message
          }`
        : `Database Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
      throw new Error(`Failed to sync libraries: ${errorMessage}`);
    }

    // Update progress to items
    await db
      .update(servers)
      .set({ syncProgress: "items" })
      .where(eq(servers.id, serverId));

    // Step 3: Sync Items (for each library)
    log("item-sync", { action: "start", serverId });
    try {
      const librariesData = await db
        .select()
        .from(libraries)
        .where(eq(libraries.serverId, serverId));

      for (const library of librariesData) {
        const itemsResponse = await axios.get(
          `${server.url}/Items?ParentId=${library.id}&Recursive=true&Fields=BasicSyncInfo,MediaSourceCount,Path,Genres`,
          {
            headers: {
              "X-Emby-Token": server.apiKey,
              "Content-Type": "application/json",
            },
            timeout: TIMEOUT_CONFIG.ITEMS_SYNC,
          }
        );
        const itemsSynced = await syncItems(
          serverId,
          library.id,
          itemsResponse.data.Items || []
        );
        syncResults.items += itemsSynced;
        log("item-sync", { action: "library-completed", serverId, library: library.name, count: itemsSynced });
      }
      log("item-sync", { action: "completed", serverId, totalCount: syncResults.items });
    } catch (error) {
      console.error(`[item-sync] action=error serverId=${serverId} error=${error instanceof Error ? error.message : String(error)}`);
      const errorMessage = axios.isAxiosError(error)
        ? `API Error: ${error.response?.status} - ${
            error.response?.statusText || error.message
          }`
        : `Database Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
      throw new Error(`Failed to sync items: ${errorMessage}`);
    }

    // Update progress to activities
    await db
      .update(servers)
      .set({ syncProgress: "activities" })
      .where(eq(servers.id, serverId));

    // Step 4: Sync Activities
    log("activity-sync", { action: "start", serverId });
    try {
      const activitiesResponse = await axios.get(
        `${server.url}/System/ActivityLog/Entries`,
        {
          headers: {
            "X-Emby-Token": server.apiKey,
            "Content-Type": "application/json",
          },
          timeout: TIMEOUT_CONFIG.DEFAULT,
        }
      );
      syncResults.activities = await syncActivities(
        serverId,
        activitiesResponse.data.Items || []
      );
      log("activity-sync", { action: "completed", serverId, count: syncResults.activities });
    } catch (error) {
      console.error(`[activity-sync] action=error serverId=${serverId} error=${error instanceof Error ? error.message : String(error)}`);
      const errorMessage = axios.isAxiosError(error)
        ? `API Error: ${error.response?.status} - ${
            error.response?.statusText || error.message
          }`
        : `Database Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
      throw new Error(`Failed to sync activities: ${errorMessage}`);
    }

    // Update server status to completed
    await db
      .update(servers)
      .set({
        syncStatus: "completed",
        syncProgress: "completed",
        lastSyncCompleted: new Date(),
      })
      .where(eq(servers.id, serverId));

    const processingTime = Date.now() - startTime;
    await logJobResult(
      job.id,
      "sequential-server-sync",
      "completed",
      syncResults,
      processingTime
    );

    log("sequential-sync", { 
      action: "completed", 
      serverId, 
      users: syncResults.users, 
      libraries: syncResults.libraries, 
      items: syncResults.items, 
      activities: syncResults.activities,
      durationMs: processingTime 
    });
    return { success: true, syncResults };
  } catch (error) {
    console.error(`[sequential-sync] action=failed serverId=${serverId} error=${error instanceof Error ? error.message : String(error)}`);

    // Update server status to failed
    await db
      .update(servers)
      .set({
        syncStatus: "failed",
        syncError: error instanceof Error ? error.message : String(error),
      })
      .where(eq(servers.id, serverId));

    const processingTime = Date.now() - startTime;
    await logJobResult(
      job.id,
      "sequential-server-sync",
      "failed",
      null,
      processingTime,
      error instanceof Error ? error.message : String(error)
    );

    throw error;
  }
}
