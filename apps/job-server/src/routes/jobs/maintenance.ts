import { Hono } from "hono";
import { db, jobResults, servers } from "@streamystats/database";
import { eq, and, sql } from "drizzle-orm";
import { cleanupDeletedItems } from "../../jellyfin/sync/deleted-items";

const app = new Hono();

app.post("/cleanup-stale", async (c) => {
  try {
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

app.post("/cleanup-deleted-items", async (c) => {
  try {
    const { serverId } = await c.req.json();

    if (!serverId) {
      return c.json({ error: "Server ID is required" }, 400);
    }

    const server = await db
      .select()
      .from(servers)
      .where(eq(servers.id, Number(serverId)))
      .limit(1);

    if (!server.length) {
      return c.json({ error: "Server not found" }, 404);
    }

    const result = await cleanupDeletedItems(server[0]);

    return c.json({
      success: result.status !== "error",
      status: result.status,
      metrics: {
        librariesScanned: result.metrics.librariesScanned,
        itemsScanned: result.metrics.itemsScanned,
        jellyfinItemsCount: result.metrics.jellyfinItemsCount,
        databaseItemsCount: result.metrics.databaseItemsCount,
        itemsSoftDeleted: result.metrics.itemsSoftDeleted,
        itemsMigrated: result.metrics.itemsMigrated,
        sessionsMigrated: result.metrics.sessionsMigrated,
        hiddenRecommendationsDeleted: result.metrics.hiddenRecommendationsDeleted,
        hiddenRecommendationsMigrated: result.metrics.hiddenRecommendationsMigrated,
        duration: result.metrics.duration,
        errors: result.metrics.errors,
      },
      errors: result.errors,
      message:
        result.status === "success"
          ? `Cleanup completed: ${result.metrics.itemsSoftDeleted} items deleted, ${result.metrics.itemsMigrated} items migrated`
          : result.status === "partial"
            ? `Cleanup completed with ${result.metrics.errors} errors`
            : "Cleanup failed",
    });
  } catch (error) {
    console.error("Error during deleted items cleanup:", error);
    return c.json(
      {
        error: "Failed to cleanup deleted items",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

export default app;

