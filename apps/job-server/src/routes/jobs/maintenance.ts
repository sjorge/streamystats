import { Hono } from "hono";
import { db, jobResults } from "@streamystats/database";
import { eq, and, sql } from "drizzle-orm";

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

export default app;

