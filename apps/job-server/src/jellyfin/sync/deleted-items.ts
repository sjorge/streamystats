import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import {
  db,
  items,
  sessions,
  libraries,
  hiddenRecommendations,
  Server,
  Item,
} from "@streamystats/database";
import { JellyfinClient, MinimalJellyfinItem } from "../client";
import { formatSyncLogLine } from "./sync-log";

export interface CleanupMetrics {
  startTime: Date;
  endTime?: Date;
  duration?: number;
  librariesScanned: number;
  itemsScanned: number;
  jellyfinItemsCount: number;
  databaseItemsCount: number;
  itemsSoftDeleted: number;
  itemsMigrated: number;
  sessionsMigrated: number;
  hiddenRecommendationsDeleted: number;
  hiddenRecommendationsMigrated: number;
  apiRequests: number;
  databaseOperations: number;
  errors: number;
}

export interface CleanupResult {
  status: "success" | "partial" | "error";
  metrics: CleanupMetrics;
  errors?: string[];
}

interface MatchResult {
  type: "deleted" | "migrated" | "exists";
  oldItemId: string;
  newItemId?: string;
  matchReason?: string;
}

/**
 * Detect and handle deleted items from Jellyfin server.
 * - Soft deletes items no longer in Jellyfin
 * - Migrates sessions/recommendations for re-added items (same providerIds but different ID)
 */
export async function cleanupDeletedItems(
  server: Server
): Promise<CleanupResult> {
  const metrics: CleanupMetrics = {
    startTime: new Date(),
    librariesScanned: 0,
    itemsScanned: 0,
    jellyfinItemsCount: 0,
    databaseItemsCount: 0,
    itemsSoftDeleted: 0,
    itemsMigrated: 0,
    sessionsMigrated: 0,
    hiddenRecommendationsDeleted: 0,
    hiddenRecommendationsMigrated: 0,
    apiRequests: 0,
    databaseOperations: 0,
    errors: 0,
  };
  const errors: string[] = [];

  try {
    const client = JellyfinClient.fromServer(server);

    console.info(
      formatSyncLogLine("deleted-items-cleanup", {
        server: server.name,
        page: 0,
        processed: 0,
        inserted: 0,
        updated: 0,
        errors: 0,
        processMs: 0,
        totalProcessed: 0,
        phase: "start",
      })
    );

    // Get all libraries for this server
    const serverLibraries = await db
      .select()
      .from(libraries)
      .where(eq(libraries.serverId, server.id));

    metrics.databaseOperations++;

    // Collect all Jellyfin items across all libraries
    const jellyfinItemsMap = new Map<string, MinimalJellyfinItem>();

    for (const library of serverLibraries) {
      try {
        metrics.apiRequests++;
        const libraryItems = await client.getAllItemsMinimal(library.id);
        metrics.librariesScanned++;

        for (const item of libraryItems) {
          jellyfinItemsMap.set(item.Id, item);
        }

        console.info(
          formatSyncLogLine("deleted-items-cleanup", {
            server: server.name,
            page: metrics.librariesScanned,
            processed: libraryItems.length,
            inserted: 0,
            updated: 0,
            errors: 0,
            processMs: 0,
            totalProcessed: jellyfinItemsMap.size,
            libraryId: library.id,
            libraryName: library.name,
            phase: "fetch",
          })
        );
      } catch (error) {
        metrics.errors++;
        errors.push(
          `Library ${library.name}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    metrics.jellyfinItemsCount = jellyfinItemsMap.size;

    // Get all non-deleted items from database for this server
    metrics.databaseOperations++;
    const databaseItems = await db
      .select({
        id: items.id,
        name: items.name,
        type: items.type,
        providerIds: items.providerIds,
        seriesId: items.seriesId,
        indexNumber: items.indexNumber,
        parentIndexNumber: items.parentIndexNumber,
      })
      .from(items)
      .where(and(eq(items.serverId, server.id), isNull(items.deletedAt)));

    metrics.databaseItemsCount = databaseItems.length;
    metrics.itemsScanned = databaseItems.length;

    console.info(
      formatSyncLogLine("deleted-items-cleanup", {
        server: server.name,
        page: 0,
        processed: 0,
        inserted: 0,
        updated: 0,
        errors: 0,
        processMs: 0,
        totalProcessed: 0,
        jellyfinItems: metrics.jellyfinItemsCount,
        databaseItems: metrics.databaseItemsCount,
        phase: "compare",
      })
    );

    // Build a map for quick ProviderIds lookup from Jellyfin items
    const providerIdToJellyfinItem = new Map<string, MinimalJellyfinItem>();
    const episodeKeyToJellyfinItem = new Map<string, MinimalJellyfinItem>();

    for (const [, jellyfinItem] of jellyfinItemsMap) {
      // Index by ProviderIds (IMDB, TMDB, etc.)
      if (jellyfinItem.ProviderIds) {
        for (const [provider, id] of Object.entries(jellyfinItem.ProviderIds)) {
          if (id) {
            providerIdToJellyfinItem.set(`${provider}:${id}`, jellyfinItem);
          }
        }
      }

      // Index episodes by series+season+episode
      if (
        jellyfinItem.Type === "Episode" &&
        jellyfinItem.SeriesId &&
        jellyfinItem.IndexNumber !== undefined &&
        jellyfinItem.ParentIndexNumber !== undefined
      ) {
        const key = `${jellyfinItem.SeriesId}:${jellyfinItem.ParentIndexNumber}:${jellyfinItem.IndexNumber}`;
        episodeKeyToJellyfinItem.set(key, jellyfinItem);
      }
    }

    // Process each database item
    const itemsToDelete: string[] = [];
    const itemsToMigrate: Array<{
      oldId: string;
      newId: string;
      reason: string;
    }> = [];

    for (const dbItem of databaseItems) {
      const matchResult = matchItem(
        dbItem,
        jellyfinItemsMap,
        providerIdToJellyfinItem,
        episodeKeyToJellyfinItem
      );

      if (matchResult.type === "deleted") {
        itemsToDelete.push(dbItem.id);
      } else if (matchResult.type === "migrated" && matchResult.newItemId) {
        itemsToMigrate.push({
          oldId: dbItem.id,
          newId: matchResult.newItemId,
          reason: matchResult.matchReason || "unknown",
        });
      }
    }

    console.info(
      formatSyncLogLine("deleted-items-cleanup", {
        server: server.name,
        page: 0,
        processed: 0,
        inserted: 0,
        updated: 0,
        errors: 0,
        processMs: 0,
        totalProcessed: 0,
        toDelete: itemsToDelete.length,
        toMigrate: itemsToMigrate.length,
        phase: "analysis",
      })
    );

    // Process deletions in batches
    if (itemsToDelete.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < itemsToDelete.length; i += batchSize) {
        const batch = itemsToDelete.slice(i, i + batchSize);

        // Soft delete items
        metrics.databaseOperations++;
        await db
          .update(items)
          .set({ deletedAt: new Date() })
          .where(inArray(items.id, batch));

        // Delete hidden recommendations for these items
        metrics.databaseOperations++;
        const deletedRecs = await db
          .delete(hiddenRecommendations)
          .where(inArray(hiddenRecommendations.itemId, batch))
          .returning({ id: hiddenRecommendations.id });

        metrics.itemsSoftDeleted += batch.length;
        metrics.hiddenRecommendationsDeleted += deletedRecs.length;
      }
    }

    // Process migrations
    for (const migration of itemsToMigrate) {
      try {
        await migrateItem(migration.oldId, migration.newId, metrics);
        metrics.itemsMigrated++;
      } catch (error) {
        metrics.errors++;
        errors.push(
          `Migration ${migration.oldId} -> ${migration.newId}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    metrics.endTime = new Date();
    metrics.duration = metrics.endTime.getTime() - metrics.startTime.getTime();

    console.info(
      formatSyncLogLine("deleted-items-cleanup", {
        server: server.name,
        page: -1,
        processed: metrics.itemsScanned,
        inserted: 0,
        updated: 0,
        errors: metrics.errors,
        processMs: metrics.duration,
        totalProcessed: metrics.itemsScanned,
        deleted: metrics.itemsSoftDeleted,
        migrated: metrics.itemsMigrated,
        sessionsMigrated: metrics.sessionsMigrated,
        hiddenRecsDeleted: metrics.hiddenRecommendationsDeleted,
        hiddenRecsMigrated: metrics.hiddenRecommendationsMigrated,
        phase: "complete",
      })
    );

    if (errors.length > 0) {
      return { status: "partial", metrics, errors };
    }

    return { status: "success", metrics };
  } catch (error) {
    metrics.endTime = new Date();
    metrics.duration = metrics.endTime.getTime() - metrics.startTime.getTime();
    metrics.errors++;

    console.error(
      formatSyncLogLine("deleted-items-cleanup", {
        server: server.name,
        page: -1,
        processed: 0,
        inserted: 0,
        updated: 0,
        errors: 1,
        processMs: metrics.duration || 0,
        totalProcessed: 0,
        message: "Cleanup failed",
        error: error instanceof Error ? error.message : "Unknown error",
      })
    );

    return {
      status: "error",
      metrics,
      errors: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
}

/**
 * Match a database item against Jellyfin items to determine its status
 */
function matchItem(
  dbItem: {
    id: string;
    name: string;
    type: string;
    providerIds: unknown;
    seriesId: string | null;
    indexNumber: number | null;
    parentIndexNumber: number | null;
  },
  jellyfinItemsMap: Map<string, MinimalJellyfinItem>,
  providerIdToJellyfinItem: Map<string, MinimalJellyfinItem>,
  episodeKeyToJellyfinItem: Map<string, MinimalJellyfinItem>
): MatchResult {
  // Check if item exists with same ID
  if (jellyfinItemsMap.has(dbItem.id)) {
    return { type: "exists", oldItemId: dbItem.id };
  }

  // Item not found by ID - check if it was re-added with different ID

  // Check by ProviderIds (IMDB, TMDB, etc.)
  const providerIds = dbItem.providerIds as Record<string, string> | null;
  if (providerIds) {
    for (const [provider, id] of Object.entries(providerIds)) {
      if (id) {
        const match = providerIdToJellyfinItem.get(`${provider}:${id}`);
        if (match && match.Id !== dbItem.id) {
          return {
            type: "migrated",
            oldItemId: dbItem.id,
            newItemId: match.Id,
            matchReason: `${provider}:${id}`,
          };
        }
      }
    }
  }

  // Check episodes by series+season+episode
  if (
    dbItem.type === "Episode" &&
    dbItem.seriesId &&
    dbItem.indexNumber !== null &&
    dbItem.parentIndexNumber !== null
  ) {
    const key = `${dbItem.seriesId}:${dbItem.parentIndexNumber}:${dbItem.indexNumber}`;
    const match = episodeKeyToJellyfinItem.get(key);
    if (match && match.Id !== dbItem.id) {
      return {
        type: "migrated",
        oldItemId: dbItem.id,
        newItemId: match.Id,
        matchReason: `episode:${key}`,
      };
    }
  }

  // Item is truly deleted
  return { type: "deleted", oldItemId: dbItem.id };
}

/**
 * Migrate sessions and hidden recommendations from old item ID to new item ID
 */
async function migrateItem(
  oldItemId: string,
  newItemId: string,
  metrics: CleanupMetrics
): Promise<void> {
  // Migrate sessions
  metrics.databaseOperations++;
  const migratedSessions = await db
    .update(sessions)
    .set({ itemId: newItemId })
    .where(eq(sessions.itemId, oldItemId))
    .returning({ id: sessions.id });

  metrics.sessionsMigrated += migratedSessions.length;

  // Migrate hidden recommendations
  metrics.databaseOperations++;
  const migratedRecs = await db
    .update(hiddenRecommendations)
    .set({ itemId: newItemId })
    .where(eq(hiddenRecommendations.itemId, oldItemId))
    .returning({ id: hiddenRecommendations.id });

  metrics.hiddenRecommendationsMigrated += migratedRecs.length;

  // Soft delete the old item
  metrics.databaseOperations++;
  await db
    .update(items)
    .set({ deletedAt: new Date() })
    .where(eq(items.id, oldItemId));
}

export { CleanupMetrics as DeletedItemsCleanupMetrics };


