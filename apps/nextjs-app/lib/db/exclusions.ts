"use cache";

import { db, items, servers, sessions } from "@streamystats/database";
import { and, eq, inArray, notInArray, type SQL } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

export interface ExclusionSettings {
  excludedUserIds: string[];
  excludedLibraryIds: string[];
}

/**
 * Get exclusion settings for a server.
 * Results are cached for performance.
 */
export async function getExclusionSettings(
  serverId: number
): Promise<ExclusionSettings> {
  "use cache";
  cacheLife("hours");
  cacheTag(`exclusion-settings-${serverId}`);

  const server = await db.query.servers.findFirst({
    where: eq(servers.id, serverId),
    columns: {
      excludedUserIds: true,
      excludedLibraryIds: true,
    },
  });

  return {
    excludedUserIds: server?.excludedUserIds ?? [],
    excludedLibraryIds: server?.excludedLibraryIds ?? [],
  };
}

/**
 * Build a SQL condition to exclude users from a sessions query.
 * Returns undefined if no users are excluded.
 */
export function buildUserExclusionCondition(
  excludedUserIds: string[]
): SQL | undefined {
  if (excludedUserIds.length === 0) {
    return undefined;
  }
  return notInArray(sessions.userId, excludedUserIds);
}

/**
 * Build a SQL condition to exclude items from excluded libraries.
 * This should be used when joining sessions with items.
 * Returns undefined if no libraries are excluded.
 */
export function buildLibraryExclusionCondition(
  excludedLibraryIds: string[]
): SQL | undefined {
  if (excludedLibraryIds.length === 0) {
    return undefined;
  }
  return notInArray(items.libraryId, excludedLibraryIds);
}

/**
 * Get item IDs that belong to excluded libraries.
 * Useful when you need to filter sessions without joining items table.
 */
export async function getExcludedItemIds(
  serverId: number,
  excludedLibraryIds: string[]
): Promise<string[]> {
  if (excludedLibraryIds.length === 0) {
    return [];
  }

  const excludedItems = await db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.serverId, serverId),
        inArray(items.libraryId, excludedLibraryIds)
      )
    );

  return excludedItems.map((item) => item.id);
}

/**
 * Helper to add exclusion conditions to an existing conditions array.
 * Modifies the array in place and returns it for chaining.
 */
export function addExclusionConditions(
  conditions: SQL[],
  exclusions: ExclusionSettings
): SQL[] {
  const userCondition = buildUserExclusionCondition(exclusions.excludedUserIds);
  if (userCondition) {
    conditions.push(userCondition);
  }

  const libraryCondition = buildLibraryExclusionCondition(
    exclusions.excludedLibraryIds
  );
  if (libraryCondition) {
    conditions.push(libraryCondition);
  }

  return conditions;
}

