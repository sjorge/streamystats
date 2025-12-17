import { Hono } from "hono";
import {
  db,
  activityLocations,
  activities,
  userFingerprints,
  anomalyEvents,
  users,
} from "@streamystats/database";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { getJobQueue } from "../jobs/queue";
import { GEOLOCATION_JOB_NAMES } from "../jobs/geolocation-jobs";

const app = new Hono();

/**
 * Get location history for a specific user
 */
app.get("/servers/:serverId/users/:userId/locations", async (c) => {
  try {
    const serverId = Number.parseInt(c.req.param("serverId"));
    const userId = c.req.param("userId");
    const limit = Number.parseInt(c.req.query("limit") || "100");
    const offset = Number.parseInt(c.req.query("offset") || "0");

    if (Number.isNaN(serverId)) {
      return c.json({ error: "Invalid server ID" }, 400);
    }

    const locations = await db
      .select({
        id: activityLocations.id,
        activityId: activityLocations.activityId,
        ipAddress: activityLocations.ipAddress,
        countryCode: activityLocations.countryCode,
        country: activityLocations.country,
        region: activityLocations.region,
        city: activityLocations.city,
        latitude: activityLocations.latitude,
        longitude: activityLocations.longitude,
        timezone: activityLocations.timezone,
        isPrivateIp: activityLocations.isPrivateIp,
        createdAt: activityLocations.createdAt,
        activityType: activities.type,
        activityName: activities.name,
        activityDate: activities.date,
      })
      .from(activityLocations)
      .innerJoin(activities, eq(activityLocations.activityId, activities.id))
      .where(
        and(eq(activities.userId, userId), eq(activities.serverId, serverId))
      )
      .orderBy(desc(activities.date))
      .limit(limit)
      .offset(offset);

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(activityLocations)
      .innerJoin(activities, eq(activityLocations.activityId, activities.id))
      .where(
        and(eq(activities.userId, userId), eq(activities.serverId, serverId))
      );

    const total = totalResult[0]?.count || 0;

    return c.json({
      locations,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + locations.length < total,
      },
    });
  } catch (error) {
    console.error("Error fetching user locations:", error);
    return c.json({ error: "Failed to fetch user locations" }, 500);
  }
});

/**
 * Get unique locations for a user (aggregated by country/city)
 */
app.get("/servers/:serverId/users/:userId/locations/unique", async (c) => {
  try {
    const serverId = Number.parseInt(c.req.param("serverId"));
    const userId = c.req.param("userId");

    if (Number.isNaN(serverId)) {
      return c.json({ error: "Invalid server ID" }, 400);
    }

    const uniqueLocations = await db
      .select({
        countryCode: activityLocations.countryCode,
        country: activityLocations.country,
        city: activityLocations.city,
        latitude: activityLocations.latitude,
        longitude: activityLocations.longitude,
        activityCount: count(),
        lastSeen: sql<string>`MAX(${activities.date})`,
      })
      .from(activityLocations)
      .innerJoin(activities, eq(activityLocations.activityId, activities.id))
      .where(
        and(
          eq(activities.userId, userId),
          eq(activities.serverId, serverId),
          eq(activityLocations.isPrivateIp, false)
        )
      )
      .groupBy(
        activityLocations.countryCode,
        activityLocations.country,
        activityLocations.city,
        activityLocations.latitude,
        activityLocations.longitude
      )
      .orderBy(desc(sql`MAX(${activities.date})`));

    return c.json({ locations: uniqueLocations });
  } catch (error) {
    console.error("Error fetching unique locations:", error);
    return c.json({ error: "Failed to fetch unique locations" }, 500);
  }
});

/**
 * Get user fingerprint
 */
app.get("/servers/:serverId/users/:userId/fingerprint", async (c) => {
  try {
    const serverId = Number.parseInt(c.req.param("serverId"));
    const userId = c.req.param("userId");

    if (Number.isNaN(serverId)) {
      return c.json({ error: "Invalid server ID" }, 400);
    }

    const fingerprint = await db.query.userFingerprints.findFirst({
      where: and(
        eq(userFingerprints.userId, userId),
        eq(userFingerprints.serverId, serverId)
      ),
    });

    if (!fingerprint) {
      return c.json({ error: "Fingerprint not found" }, 404);
    }

    return c.json({ fingerprint });
  } catch (error) {
    console.error("Error fetching user fingerprint:", error);
    return c.json({ error: "Failed to fetch user fingerprint" }, 500);
  }
});

/**
 * Get anomalies for a specific user
 */
app.get("/servers/:serverId/users/:userId/anomalies", async (c) => {
  try {
    const serverId = Number.parseInt(c.req.param("serverId"));
    const userId = c.req.param("userId");
    const resolved = c.req.query("resolved");
    const limit = Number.parseInt(c.req.query("limit") || "50");
    const offset = Number.parseInt(c.req.query("offset") || "0");

    if (Number.isNaN(serverId)) {
      return c.json({ error: "Invalid server ID" }, 400);
    }

    let whereClause = and(
      eq(anomalyEvents.userId, userId),
      eq(anomalyEvents.serverId, serverId)
    );

    if (resolved === "true") {
      whereClause = and(whereClause, eq(anomalyEvents.resolved, true));
    } else if (resolved === "false") {
      whereClause = and(whereClause, eq(anomalyEvents.resolved, false));
    }

    const anomalies = await db
      .select()
      .from(anomalyEvents)
      .where(whereClause)
      .orderBy(desc(anomalyEvents.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(anomalyEvents)
      .where(whereClause);

    const total = totalResult[0]?.count || 0;

    // Get unresolved count
    const unresolvedResult = await db
      .select({ count: count() })
      .from(anomalyEvents)
      .where(
        and(
          eq(anomalyEvents.userId, userId),
          eq(anomalyEvents.serverId, serverId),
          eq(anomalyEvents.resolved, false)
        )
      );

    const unresolvedCount = unresolvedResult[0]?.count || 0;

    return c.json({
      anomalies,
      unresolvedCount,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + anomalies.length < total,
      },
    });
  } catch (error) {
    console.error("Error fetching user anomalies:", error);
    return c.json({ error: "Failed to fetch user anomalies" }, 500);
  }
});

/**
 * Get all anomalies for a server (admin view)
 */
app.get("/servers/:serverId/anomalies", async (c) => {
  try {
    const serverId = Number.parseInt(c.req.param("serverId"));
    const resolved = c.req.query("resolved");
    const severity = c.req.query("severity");
    const limit = Number.parseInt(c.req.query("limit") || "50");
    const offset = Number.parseInt(c.req.query("offset") || "0");

    if (Number.isNaN(serverId)) {
      return c.json({ error: "Invalid server ID" }, 400);
    }

    const conditions = [eq(anomalyEvents.serverId, serverId)];

    if (resolved === "true") {
      conditions.push(eq(anomalyEvents.resolved, true));
    } else if (resolved === "false") {
      conditions.push(eq(anomalyEvents.resolved, false));
    }

    if (severity) {
      conditions.push(eq(anomalyEvents.severity, severity));
    }

    const whereClause = and(...conditions);

    const anomalies = await db
      .select({
        id: anomalyEvents.id,
        userId: anomalyEvents.userId,
        activityId: anomalyEvents.activityId,
        anomalyType: anomalyEvents.anomalyType,
        severity: anomalyEvents.severity,
        details: anomalyEvents.details,
        resolved: anomalyEvents.resolved,
        resolvedAt: anomalyEvents.resolvedAt,
        resolvedBy: anomalyEvents.resolvedBy,
        resolutionNote: anomalyEvents.resolutionNote,
        createdAt: anomalyEvents.createdAt,
        userName: users.name,
      })
      .from(anomalyEvents)
      .leftJoin(users, eq(anomalyEvents.userId, users.id))
      .where(whereClause)
      .orderBy(desc(anomalyEvents.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(anomalyEvents)
      .where(whereClause);

    const total = totalResult[0]?.count || 0;

    // Get severity breakdown
    const severityBreakdown = await db
      .select({
        severity: anomalyEvents.severity,
        count: count(),
      })
      .from(anomalyEvents)
      .where(
        and(
          eq(anomalyEvents.serverId, serverId),
          eq(anomalyEvents.resolved, false)
        )
      )
      .groupBy(anomalyEvents.severity);

    return c.json({
      anomalies,
      severityBreakdown: Object.fromEntries(
        severityBreakdown.map((s) => [s.severity, s.count])
      ),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + anomalies.length < total,
      },
    });
  } catch (error) {
    console.error("Error fetching server anomalies:", error);
    return c.json({ error: "Failed to fetch server anomalies" }, 500);
  }
});

/**
 * Resolve an anomaly
 */
app.post("/servers/:serverId/anomalies/:anomalyId/resolve", async (c) => {
  try {
    const serverId = Number.parseInt(c.req.param("serverId"));
    const anomalyId = Number.parseInt(c.req.param("anomalyId"));
    const body = await c.req.json<{
      resolvedBy?: string;
      resolutionNote?: string;
    }>();

    if (Number.isNaN(serverId) || Number.isNaN(anomalyId)) {
      return c.json({ error: "Invalid server ID or anomaly ID" }, 400);
    }

    const result = await db
      .update(anomalyEvents)
      .set({
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: body.resolvedBy,
        resolutionNote: body.resolutionNote,
      })
      .where(
        and(
          eq(anomalyEvents.id, anomalyId),
          eq(anomalyEvents.serverId, serverId)
        )
      )
      .returning();

    if (result.length === 0) {
      return c.json({ error: "Anomaly not found" }, 404);
    }

    return c.json({ success: true, anomaly: result[0] });
  } catch (error) {
    console.error("Error resolving anomaly:", error);
    return c.json({ error: "Failed to resolve anomaly" }, 500);
  }
});

/**
 * Unresolve an anomaly
 */
app.post("/servers/:serverId/anomalies/:anomalyId/unresolve", async (c) => {
  try {
    const serverId = Number.parseInt(c.req.param("serverId"));
    const anomalyId = Number.parseInt(c.req.param("anomalyId"));

    if (Number.isNaN(serverId) || Number.isNaN(anomalyId)) {
      return c.json({ error: "Invalid server ID or anomaly ID" }, 400);
    }

    const result = await db
      .update(anomalyEvents)
      .set({
        resolved: false,
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
      })
      .where(
        and(
          eq(anomalyEvents.id, anomalyId),
          eq(anomalyEvents.serverId, serverId)
        )
      )
      .returning();

    if (result.length === 0) {
      return c.json({ error: "Anomaly not found" }, 404);
    }

    return c.json({ success: true, anomaly: result[0] });
  } catch (error) {
    console.error("Error unresolving anomaly:", error);
    return c.json({ error: "Failed to unresolve anomaly" }, 500);
  }
});

/**
 * Get all locations for a server (for map visualization)
 */
app.get("/servers/:serverId/locations", async (c) => {
  try {
    const serverId = Number.parseInt(c.req.param("serverId"));

    if (Number.isNaN(serverId)) {
      return c.json({ error: "Invalid server ID" }, 400);
    }

    // Get aggregated locations per user
    const locations = await db
      .select({
        userId: activities.userId,
        userName: users.name,
        countryCode: activityLocations.countryCode,
        country: activityLocations.country,
        city: activityLocations.city,
        latitude: activityLocations.latitude,
        longitude: activityLocations.longitude,
        activityCount: count(),
        lastSeen: sql<string>`MAX(${activities.date})`,
      })
      .from(activityLocations)
      .innerJoin(activities, eq(activityLocations.activityId, activities.id))
      .leftJoin(users, eq(activities.userId, users.id))
      .where(
        and(
          eq(activities.serverId, serverId),
          eq(activityLocations.isPrivateIp, false)
        )
      )
      .groupBy(
        activities.userId,
        users.name,
        activityLocations.countryCode,
        activityLocations.country,
        activityLocations.city,
        activityLocations.latitude,
        activityLocations.longitude
      )
      .orderBy(desc(sql`MAX(${activities.date})`));

    return c.json({ locations });
  } catch (error) {
    console.error("Error fetching server locations:", error);
    return c.json({ error: "Failed to fetch server locations" }, 500);
  }
});

/**
 * Trigger geolocation backfill for a server
 */
app.post("/servers/:serverId/locations/backfill", async (c) => {
  try {
    const serverId = Number.parseInt(c.req.param("serverId"));

    if (Number.isNaN(serverId)) {
      return c.json({ error: "Invalid server ID" }, 400);
    }

    const boss = await getJobQueue();

    const jobId = await boss.send(
      GEOLOCATION_JOB_NAMES.BACKFILL_LOCATIONS,
      { serverId, batchSize: 500 },
      {
        expireInMinutes: 360,
        retryLimit: 1,
        retryDelay: 300,
      }
    );

    return c.json({
      success: true,
      jobId,
      message: "Geolocation backfill job started",
    });
  } catch (error) {
    console.error("Error starting backfill job:", error);
    return c.json({ error: "Failed to start backfill job" }, 500);
  }
});

/**
 * Trigger fingerprint recalculation for a server
 */
app.post("/servers/:serverId/fingerprints/recalculate", async (c) => {
  try {
    const serverId = Number.parseInt(c.req.param("serverId"));

    if (Number.isNaN(serverId)) {
      return c.json({ error: "Invalid server ID" }, 400);
    }

    const boss = await getJobQueue();

    const jobId = await boss.send(
      GEOLOCATION_JOB_NAMES.CALCULATE_FINGERPRINTS,
      { serverId },
      {
        expireInMinutes: 60,
        retryLimit: 1,
        retryDelay: 120,
      }
    );

    return c.json({
      success: true,
      jobId,
      message: "Fingerprint recalculation job started",
    });
  } catch (error) {
    console.error("Error starting fingerprint job:", error);
    return c.json({ error: "Failed to start fingerprint job" }, 500);
  }
});

/**
 * Get location statistics for a server
 */
app.get("/servers/:serverId/locations/stats", async (c) => {
  try {
    const serverId = Number.parseInt(c.req.param("serverId"));

    if (Number.isNaN(serverId)) {
      return c.json({ error: "Invalid server ID" }, 400);
    }

    // Total activities with location
    const totalLocatedResult = await db
      .select({ count: count() })
      .from(activityLocations)
      .innerJoin(activities, eq(activityLocations.activityId, activities.id))
      .where(
        and(
          eq(activities.serverId, serverId),
          eq(activityLocations.isPrivateIp, false)
        )
      );

    // Total activities without location (pending geolocation) - only those with IP in shortOverview
    const pendingResult = await db
      .select({ count: count() })
      .from(activities)
      .leftJoin(
        activityLocations,
        eq(activities.id, activityLocations.activityId)
      )
      .where(
        and(
          eq(activities.serverId, serverId),
          sql`${activityLocations.id} IS NULL`,
          sql`${activities.shortOverview} LIKE '%IP%'`
        )
      );

    // Unique countries
    const countriesResult = await db
      .selectDistinct({ country: activityLocations.countryCode })
      .from(activityLocations)
      .innerJoin(activities, eq(activityLocations.activityId, activities.id))
      .where(
        and(
          eq(activities.serverId, serverId),
          eq(activityLocations.isPrivateIp, false)
        )
      );

    // Unique cities
    const citiesResult = await db
      .selectDistinct({ city: activityLocations.city })
      .from(activityLocations)
      .innerJoin(activities, eq(activityLocations.activityId, activities.id))
      .where(
        and(
          eq(activities.serverId, serverId),
          eq(activityLocations.isPrivateIp, false),
          sql`${activityLocations.city} IS NOT NULL`
        )
      );

    // Users with fingerprints
    const fingerprintsResult = await db
      .select({ count: count() })
      .from(userFingerprints)
      .where(eq(userFingerprints.serverId, serverId));

    // Unresolved anomalies by severity
    const anomaliesResult = await db
      .select({
        severity: anomalyEvents.severity,
        count: count(),
      })
      .from(anomalyEvents)
      .where(
        and(
          eq(anomalyEvents.serverId, serverId),
          eq(anomalyEvents.resolved, false)
        )
      )
      .groupBy(anomalyEvents.severity);

    return c.json({
      totalLocatedActivities: totalLocatedResult[0]?.count || 0,
      pendingActivities: pendingResult[0]?.count || 0,
      uniqueCountries: countriesResult.length,
      uniqueCities: citiesResult.length,
      usersWithFingerprints: fingerprintsResult[0]?.count || 0,
      unresolvedAnomalies: Object.fromEntries(
        anomaliesResult.map((a) => [a.severity, a.count])
      ),
    });
  } catch (error) {
    console.error("Error fetching location stats:", error);
    return c.json({ error: "Failed to fetch location stats" }, 500);
  }
});

export default app;
