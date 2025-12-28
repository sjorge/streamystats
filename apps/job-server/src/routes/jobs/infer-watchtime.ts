import { Hono } from "hono";
import { getJobQueue } from "../../jobs/queue";
import { db, servers, sessions } from "@streamystats/database";
import { eq, and, sql } from "drizzle-orm";
import { INFER_WATCHTIME_JOB_NAME } from "../../jobs/infer-watchtime-job";

const app = new Hono();

/**
 * Trigger watchtime inference for a user or all users
 * POST /infer-watchtime/trigger
 * Body: { serverId: number, userId?: string, triggeredBy: string, isAdmin: boolean }
 */
app.post("/infer-watchtime/trigger", async (c) => {
  try {
    const { serverId, userId, triggeredBy, isAdmin } = await c.req.json();

    if (!serverId) {
      return c.json({ error: "Server ID is required" }, 400);
    }

    if (!triggeredBy) {
      return c.json({ error: "triggeredBy user ID is required" }, 400);
    }

    // Verify server exists
    const server = await db.query.servers.findFirst({
      where: eq(servers.id, Number(serverId)),
    });

    if (!server) {
      return c.json({ error: "Server not found" }, 404);
    }

    const boss = await getJobQueue();

    const jobId = await boss.send(
      INFER_WATCHTIME_JOB_NAME,
      {
        serverId: Number(serverId),
        userId: userId || undefined,
        triggeredBy,
        isAdmin: Boolean(isAdmin),
      },
      {
        expireInSeconds: 3600, // 1 hour
        retryLimit: 1,
        retryDelay: 60,
        singletonKey: userId
          ? `infer-watchtime-${serverId}-${userId}`
          : `infer-watchtime-${serverId}-all`,
      }
    );

    return c.json({
      success: true,
      jobId,
      message: userId
        ? "Watchtime inference started for user"
        : "Watchtime inference started for all users",
    });
  } catch (error) {
    console.error("Error triggering watchtime inference:", error);
    return c.json(
      {
        error: "Failed to trigger watchtime inference",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

/**
 * Delete all inferred sessions for a server/user
 * Useful for cleanup if user wants to re-run inference
 * DELETE /infer-watchtime/cleanup
 * Body: { serverId: number, userId?: string }
 */
app.delete("/infer-watchtime/cleanup", async (c) => {
  try {
    const { serverId, userId } = await c.req.json();

    if (!serverId) {
      return c.json({ error: "Server ID is required" }, 400);
    }

    const conditions = [
      eq(sessions.serverId, Number(serverId)),
      eq(sessions.isInferred, true),
    ];

    if (userId) {
      conditions.push(eq(sessions.userId, userId));
    }

    const result = await db
      .delete(sessions)
      .where(and(...conditions))
      .returning({ id: sessions.id });

    return c.json({
      success: true,
      deletedCount: result.length,
      message: `Deleted ${result.length} inferred sessions`,
    });
  } catch (error) {
    console.error("Error cleaning up inferred sessions:", error);
    return c.json(
      {
        error: "Failed to cleanup inferred sessions",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

/**
 * Get count of inferred sessions for a server/user
 * GET /infer-watchtime/stats?serverId=X&userId=Y
 */
app.get("/infer-watchtime/stats", async (c) => {
  try {
    const serverId = c.req.query("serverId");
    const userId = c.req.query("userId");

    if (!serverId) {
      return c.json({ error: "Server ID is required" }, 400);
    }

    const conditions = [
      eq(sessions.serverId, Number(serverId)),
      eq(sessions.isInferred, true),
    ];

    if (userId) {
      conditions.push(eq(sessions.userId, userId));
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(and(...conditions));

    return c.json({
      success: true,
      inferredSessionCount: Number(result[0]?.count ?? 0),
    });
  } catch (error) {
    console.error("Error getting inferred session stats:", error);
    return c.json({ error: "Failed to get stats" }, 500);
  }
});

export default app;
