import "server-only";
import { db, items, sessions } from "@streamystats/database";
import { and, count, eq, isNotNull, sql, sum } from "drizzle-orm";
import {
  type ActorDetailsResponse,
  type ActorItem,
  type Person,
  parsePeople,
} from "./actor-types";
import { getStatisticsExclusions } from "./exclusions";

export type {
  ActorDetailsResponse,
  ActorItem,
  ActorStats,
  Person,
} from "./actor-types";
export {
  getItemCast,
  getItemDirectors,
  getItemPeopleGrouped,
  getItemWriters,
  parsePeople,
} from "./actor-types";

/**
 * Get actor details with all items they appear in and statistics
 */
export const getActorDetails = async ({
  serverId,
  actorId,
}: {
  serverId: number;
  actorId: string;
}): Promise<ActorDetailsResponse | null> => {
  // Get exclusion settings
  const exclusions = await getStatisticsExclusions(serverId);

  // Find all items that have this actor using array containment check
  const allItems = await db
    .select({
      item: items,
    })
    .from(items)
    .where(
      and(
        eq(items.serverId, serverId),
        isNotNull(items.people),
        sql`jsonb_typeof(${items.people}) = 'array'`,
        sql`EXISTS (
          SELECT 1 FROM jsonb_array_elements(${items.people}) AS person
          WHERE person->>'Id' = ${actorId}
        )`,
      ),
    );

  if (allItems.length === 0) {
    return null;
  }

  // Find the actor info from the first item
  let actorInfo: Person | null = null;
  for (const { item } of allItems) {
    const people = parsePeople(item.people);
    const actor = people.find((p) => p.Id === actorId);
    if (actor) {
      actorInfo = actor;
      break;
    }
  }

  if (!actorInfo) {
    return null;
  }

  // Get statistics for each item
  const itemsWithStats: ActorItem[] = await Promise.all(
    allItems.map(async ({ item }) => {
      const people = parsePeople(item.people);
      const personInItem = people.find((p) => p.Id === actorId);

      // Get stats for this item - handle both Movies and Series
      let itemIdsToQuery: string[] = [item.id];

      if (item.type === "Series") {
        // Get all episode IDs for this series
        const episodes = await db
          .select({ id: items.id })
          .from(items)
          .where(and(eq(items.type, "Episode"), eq(items.seriesId, item.id)));
        itemIdsToQuery = episodes.map((ep) => ep.id);
        if (itemIdsToQuery.length === 0) {
          return {
            item,
            role: personInItem?.Role,
            totalViews: 0,
            totalWatchTime: 0,
          };
        }
      }

      // Build where conditions
      const whereConditions = [
        sql`${sessions.itemId} IN (${sql.join(
          itemIdsToQuery.map((id) => sql`${id}`),
          sql`, `,
        )})`,
        isNotNull(sessions.playDuration),
      ];

      // Add user exclusion filter
      if (exclusions.userExclusion) {
        whereConditions.push(exclusions.userExclusion);
      }

      const stats = await db
        .select({
          totalViews: count(sessions.id),
          totalWatchTime: sum(sessions.playDuration),
        })
        .from(sessions)
        .where(and(...whereConditions));

      return {
        item,
        role: personInItem?.Role,
        totalViews: stats[0]?.totalViews || 0,
        totalWatchTime: Number(stats[0]?.totalWatchTime || 0),
      };
    }),
  );

  // Sort by total watch time descending
  itemsWithStats.sort((a, b) => b.totalWatchTime - a.totalWatchTime);

  // Calculate totals
  const totalViews = itemsWithStats.reduce((sum, i) => sum + i.totalViews, 0);
  const totalWatchTime = itemsWithStats.reduce(
    (sum, i) => sum + i.totalWatchTime,
    0,
  );

  return {
    id: actorInfo.Id,
    name: actorInfo.Name,
    type: actorInfo.Type,
    primaryImageTag: actorInfo.PrimaryImageTag,
    totalItems: itemsWithStats.length,
    totalViews,
    totalWatchTime,
    items: itemsWithStats,
  };
};
