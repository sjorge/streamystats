import { db, servers } from "@streamystats/database";
import { eq, and, sql, or, isNull, lt } from "drizzle-orm";
import { logger } from "../utils/logger";

/**
 * Reset servers stuck in "syncing" status.
 * This is application-level state that pg-boss can't manage.
 */
export async function cleanupStuckServers(
  thresholdMinutes = 30
): Promise<number> {
  try {
    const result = await db
      .update(servers)
      .set({
        syncStatus: "failed",
        syncError: `Sync timed out after ${thresholdMinutes} minutes`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(servers.syncStatus, "syncing"),
          or(
            isNull(servers.lastSyncStarted),
            lt(
              servers.lastSyncStarted,
              sql`NOW() - INTERVAL '${thresholdMinutes} minutes'`
            )
          )
        )
      )
      .returning({ id: servers.id, name: servers.name });

    if (result.length > 0) {
      logger.warn("Reset stuck servers", {
        count: result.length,
        servers: result.map((s) => s.name).join(", "),
      });
    }

    return result.length;
  } catch (error) {
    logger.error("Failed to cleanup stuck servers", { error });
    return 0;
  }
}

/**
 * Startup cleanup - reset any servers stuck in syncing state
 */
export async function performStartupCleanup(): Promise<void> {
  logger.info("Performing startup cleanup");

  try {
    const result = await db
      .update(servers)
      .set({
        syncStatus: "pending",
        syncError: null,
        updatedAt: new Date(),
      })
      .where(eq(servers.syncStatus, "syncing"))
      .returning({ id: servers.id, name: servers.name });

    if (result.length > 0) {
      logger.info("Startup cleanup: reset stuck servers", {
        count: result.length,
        servers: result.map((s) => s.name).join(", "),
      });
    }
  } catch (error) {
    logger.error("Startup cleanup failed", { error });
  }
}
