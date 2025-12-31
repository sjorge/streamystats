import type { Job } from "pg-boss";
import {
  db,
  servers,
  jobResults,
  items,
} from "@streamystats/database";
import type { EmbeddingJobResult } from "@streamystats/database/schema";
import { eq, and, sql, ne, or, isNull, lt } from "drizzle-orm";
import { cleanupDeletedItems } from "../jellyfin/sync/deleted-items";
import { activityScheduler } from "./scheduler";

export const SCHEDULER_MAINTENANCE_JOB_NAME = "scheduler-maintenance";

/**
 * Worker for the scheduler-maintenance job.
 * This job runs every minute and handles global cleanup tasks:
 * - Reset stale sync status for servers stuck in "syncing"
 * - Clean up stale embedding jobs
 * - Clean up deleted items (hourly, at minute 0)
 * - Clean up old job results (daily at 3 AM)
 */
export async function schedulerMaintenanceWorker(
  job: Job<Record<string, never>>
): Promise<void> {
  const now = new Date();
  const minute = now.getMinutes();
  const hour = now.getHours();

  // Always run: Reset stale sync status and clean up stale jobs
  await runJobCleanup();

  // Run at minute 0 of each hour: Deleted items cleanup
  if (minute === 0) {
    await runDeletedItemsCleanup();
  }

  // Run daily at 3 AM: Old job results cleanup
  if (hour === 3 && minute === 0) {
    await runOldJobCleanup();
  }
}

/**
 * Reset servers stuck in "syncing" status for more than 30 minutes
 * and clean up stale embedding jobs
 */
async function runJobCleanup(): Promise<void> {
  try {
    // Reset stale sync status
    const resetResult = await db
      .update(servers)
      .set({
        syncStatus: "failed",
        syncError:
          "Sync timed out - status was stuck in syncing for more than 30 minutes",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(servers.syncStatus, "syncing"),
          or(
            isNull(servers.lastSyncStarted),
            lt(servers.lastSyncStarted, sql`NOW() - INTERVAL '30 minutes'`)
          )
        )
      )
      .returning({ id: servers.id, name: servers.name });

    if (resetResult.length > 0) {
      console.log(
        `[maintenance] reset-stale-sync resetCount=${
          resetResult.length
        } servers=${resetResult.map((s) => s.name).join(",")}`
      );
    }

    // Clean up stale embedding jobs
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
        const result = staleJob.result as EmbeddingJobResult | null;
        const serverId = result?.serverId;

        if (serverId) {
          const lastHeartbeat = result?.lastHeartbeat
            ? new Date(result.lastHeartbeat).getTime()
            : new Date(staleJob.createdAt).getTime();
          const heartbeatAge = Date.now() - lastHeartbeat;

          // Only cleanup if no recent heartbeat (older than 2 minutes)
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
                  "Job exceeded maximum processing time without heartbeat",
                processingTime,
                result: {
                  ...result,
                  error: "Job cleanup - exceeded maximum processing time",
                  cleanedAt: new Date().toISOString(),
                  staleDuration: heartbeatAge,
                },
              })
              .where(eq(jobResults.id, staleJob.id));

            cleanedCount++;
            console.info(`[maintenance] stale-embedding serverId=${serverId}`);
          }
        }
      } catch (error) {
        console.error(
          "[maintenance] error cleaning stale job:",
          staleJob.jobId,
          error
        );
      }
    }

    if (cleanedCount > 0) {
      console.info(`[maintenance] stale-embedding cleanedCount=${cleanedCount}`);
    }
  } catch (error) {
    console.error("[maintenance] job-cleanup error:", error);
  }
}

/**
 * Clean up deleted items for all servers
 */
async function runDeletedItemsCleanup(): Promise<void> {
  try {
    console.log("[maintenance] deleted-items-cleanup starting");

    const activeServers = await db
      .select()
      .from(servers)
      .where(
        or(
          ne(servers.syncStatus, "syncing"),
          and(
            eq(servers.syncStatus, "syncing"),
            or(
              isNull(servers.lastSyncStarted),
              lt(servers.lastSyncStarted, sql`NOW() - INTERVAL '30 minutes'`)
            )
          )
        )
      );

    let processedCount = 0;

    for (const server of activeServers) {
      // Check if job is enabled for this server
      if (!activityScheduler.isJobEnabledForServer(server.id, "deleted-items-cleanup")) {
        continue;
      }

      try {
        const result = await cleanupDeletedItems(server);
        processedCount++;
        console.log(
          `[maintenance] deleted-items-cleanup server=${server.name} status=${result.status} deleted=${result.metrics.itemsSoftDeleted} migrated=${result.metrics.itemsMigrated} durationMs=${result.metrics.duration}`
        );
      } catch (error) {
        console.error(
          `[maintenance] deleted-items-cleanup server=${server.name} error:`,
          error
        );
      }
    }

    console.log(
      `[maintenance] deleted-items-cleanup completed serverCount=${processedCount}`
    );
  } catch (error) {
    console.error("[maintenance] deleted-items-cleanup error:", error);
  }
}

/**
 * Clean up old job results (older than 10 days)
 */
async function runOldJobCleanup(): Promise<void> {
  try {
    console.log("[maintenance] old-job-cleanup starting");

    const result = await db
      .delete(jobResults)
      .where(sql`${jobResults.createdAt} < NOW() - INTERVAL '10 days'`)
      .returning({ id: jobResults.id });

    console.log(
      `[maintenance] old-job-cleanup completed deletedCount=${result.length}`
    );
  } catch (error) {
    console.error("[maintenance] old-job-cleanup error:", error);
  }
}
