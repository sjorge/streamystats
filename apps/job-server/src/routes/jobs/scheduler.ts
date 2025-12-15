import { Hono } from "hono";
import { db, servers } from "@streamystats/database";
import { activityScheduler } from "../../jobs/scheduler";
import { eq } from "drizzle-orm";

const app = new Hono();

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
      .where(eq(servers.id, Number.parseInt(serverId)))
      .limit(1);

    if (!server.length) {
      return c.json({ error: "Server not found" }, 404);
    }

    await activityScheduler.triggerServerActivitySync(
      Number.parseInt(serverId)
    );

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
      .where(eq(servers.id, Number.parseInt(serverId)))
      .limit(1);

    if (!server.length) {
      return c.json({ error: "Server not found" }, 404);
    }

    await activityScheduler.triggerServerUserSync(Number.parseInt(serverId));

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
      .where(eq(servers.id, Number.parseInt(serverId)))
      .limit(1);

    if (!server.length) {
      return c.json({ error: "Server not found" }, 404);
    }

    await activityScheduler.triggerServerFullSync(Number.parseInt(serverId));

    return c.json({
      success: true,
      message: `Full sync triggered for server: ${server[0].name}`,
    });
  } catch (error) {
    console.error("Error triggering full sync:", error);
    return c.json({ error: "Failed to trigger full sync" }, 500);
  }
});

app.post("/scheduler/trigger-library-sync", async (c) => {
  try {
    const { serverId, libraryId } = await c.req.json();

    if (!serverId) {
      return c.json({ error: "Server ID is required" }, 400);
    }

    if (!libraryId) {
      return c.json({ error: "Library ID is required" }, 400);
    }

    const server = await db
      .select({ id: servers.id, name: servers.name })
      .from(servers)
      .where(eq(servers.id, Number.parseInt(serverId)))
      .limit(1);

    if (!server.length) {
      return c.json({ error: "Server not found" }, 404);
    }

    await activityScheduler.triggerLibraryItemsSync(
      Number.parseInt(serverId),
      libraryId
    );

    return c.json({
      success: true,
      message: `Library sync triggered for server: ${server[0].name}`,
    });
  } catch (error) {
    console.error("Error triggering library sync:", error);
    return c.json({ error: "Failed to trigger library sync" }, 500);
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

export default app;
