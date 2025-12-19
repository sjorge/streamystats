"use server";

import { db } from "@streamystats/database";
import {
  hiddenRecommendations,
  items,
  servers,
  sessions,
} from "@streamystats/database/schema";
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { cosineDistance } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { type Holiday, getActiveHolidays } from "../holidays";
import { getMe } from "./users";

export interface SeasonalRecommendationItem {
  id: string;
  name: string;
  type: string | null;
  overview: string | null;
  productionYear: number | null;
  runtimeTicks: number | null;
  genres: string[] | null;
  communityRating: number | null;
  primaryImageTag: string | null;
  primaryImageThumbTag: string | null;
  primaryImageLogoTag: string | null;
  backdropImageTags: string[] | null;
  seriesId: string | null;
  seriesPrimaryImageTag: string | null;
  parentBackdropItemId: string | null;
  parentBackdropImageTags: string[] | null;
  parentThumbItemId: string | null;
  parentThumbImageTag: string | null;
}

export interface SeasonalRecommendationResult {
  holiday: Holiday;
  items: Array<{
    item: SeasonalRecommendationItem;
    matchScore: number;
    matchReason: string;
  }>;
}

const itemSelect = {
  id: items.id,
  name: items.name,
  type: items.type,
  overview: items.overview,
  productionYear: items.productionYear,
  runtimeTicks: items.runtimeTicks,
  genres: items.genres,
  communityRating: items.communityRating,
  primaryImageTag: items.primaryImageTag,
  primaryImageThumbTag: items.primaryImageThumbTag,
  primaryImageLogoTag: items.primaryImageLogoTag,
  backdropImageTags: items.backdropImageTags,
  seriesId: items.seriesId,
  seriesPrimaryImageTag: items.seriesPrimaryImageTag,
  parentBackdropItemId: items.parentBackdropItemId,
  parentBackdropImageTags: items.parentBackdropImageTags,
  parentThumbItemId: items.parentThumbItemId,
  parentThumbImageTag: items.parentThumbImageTag,
} as const;

/**
 * Get seasonal recommendations based on the current active holiday/season.
 * Uses keyword matching in name/overview and genre matching.
 */
export async function getSeasonalRecommendations(
  serverId: string | number,
  limit = 15,
): Promise<SeasonalRecommendationResult | null> {
  // Note: Removing cache temporarily for debugging - can re-enable later
  // "use cache";
  // cacheLife("hours");

  const serverIdNum = Number(serverId);

  // Get server's disabled holidays
  const server = await db.query.servers.findFirst({
    where: eq(servers.id, serverIdNum),
    columns: { disabledHolidays: true },
  });

  const disabledHolidays = server?.disabledHolidays || [];

  // Get all active holidays and filter out disabled ones
  const activeHolidays = getActiveHolidays();
  const enabledHolidays = activeHolidays.filter(
    (h) => !disabledHolidays.includes(h.id),
  );

  if (enabledHolidays.length === 0) {
    console.log(
      `[Seasonal] No enabled holidays (${activeHolidays.length} active, ${disabledHolidays.length} disabled)`,
    );
    return null;
  }

  // Use the highest priority enabled holiday
  const holiday = enabledHolidays[0];
  // cacheTag(`seasonal-${serverIdNum}-${holiday.id}`);

  console.log(`[Seasonal] Active holiday: ${holiday.name} (${holiday.id})`);
  console.log(
    `[Seasonal] Keywords: ${holiday.keywords.slice(0, 5).join(", ")}...`,
  );
  console.log(`[Seasonal] Genres: ${holiday.genres.join(", ") || "none"}`);

  try {
    const currentUser = await getMe();
    const userId =
      currentUser?.serverId === serverIdNum ? currentUser.id : null;

    // Get user's watched items and hidden recommendations
    let watchedItemIds: string[] = [];
    let hiddenItemIds: string[] = [];

    if (userId) {
      const [watchedItems, hiddenItems] = await Promise.all([
        db
          .select({ itemId: sessions.itemId })
          .from(sessions)
          .where(
            and(
              eq(sessions.serverId, serverIdNum),
              eq(sessions.userId, userId),
              isNotNull(sessions.itemId),
            ),
          )
          .groupBy(sessions.itemId),
        db
          .select({ itemId: hiddenRecommendations.itemId })
          .from(hiddenRecommendations)
          .where(
            and(
              eq(hiddenRecommendations.serverId, serverIdNum),
              eq(hiddenRecommendations.userId, userId),
            ),
          ),
      ]);

      watchedItemIds = watchedItems
        .map((w) => w.itemId)
        .filter((id): id is string => id !== null);
      hiddenItemIds = hiddenItems.map((h) => h.itemId).filter(Boolean);
    }

    const excludeIds = [...watchedItemIds, ...hiddenItemIds];

    // Build keyword search conditions
    const keywordConditions = holiday.keywords.flatMap((keyword) => [
      ilike(items.name, `%${keyword}%`),
      ilike(items.overview, `%${keyword}%`),
    ]);

    // Build genre conditions
    const genreConditions = holiday.genres.map(
      (genre) => sql`${genre} = ANY(${items.genres})`,
    );

    // Combine all search conditions
    const searchConditions = [...keywordConditions, ...genreConditions];

    if (searchConditions.length === 0) {
      return null;
    }

    console.log(
      `[Seasonal] Search conditions count: ${searchConditions.length}`,
    );
    console.log(`[Seasonal] Exclude IDs count: ${excludeIds.length}`);

    // First, find direct keyword/genre matches (Movies and Series only)
    const directMatches = await db
      .select({
        item: itemSelect,
        embedding: items.embedding,
      })
      .from(items)
      .where(
        and(
          eq(items.serverId, serverIdNum),
          isNull(items.deletedAt),
          inArray(items.type, ["Movie", "Series"]),
          or(...searchConditions),
          excludeIds.length > 0 ? notInArray(items.id, excludeIds) : sql`true`,
        ),
      )
      .limit(limit * 2);

    console.log(`[Seasonal] Direct matches found: ${directMatches.length}`);

    // Score and categorize matches
    const scoredMatches = directMatches.map((match) => {
      let score = 0;
      const reasons: string[] = [];
      const nameLower = match.item.name.toLowerCase();
      const overviewLower = (match.item.overview || "").toLowerCase();
      const itemGenres = match.item.genres || [];

      let hasTitleMatch = false;

      // Score keyword matches
      for (const keyword of holiday.keywords) {
        const keywordLower = keyword.toLowerCase();
        if (nameLower.includes(keywordLower)) {
          // Title match - high value, especially for longer/specific keywords
          const keywordBonus = Math.min(keyword.length, 15); // Longer keywords = more specific
          score += 15 + keywordBonus;
          hasTitleMatch = true;
          if (reasons.length < 2) {
            reasons.push(`"${keyword}" in title`);
          }
        } else if (overviewLower.includes(keywordLower)) {
          // Overview match - only count if keyword is specific enough (5+ chars)
          if (keyword.length >= 5) {
            score += 3;
            if (
              reasons.length < 2 &&
              !reasons.some((r) => r.includes("description"))
            ) {
              reasons.push("keyword in description");
            }
          }
        }
      }

      // Score genre matches - strong signal
      for (const genre of holiday.genres) {
        if (itemGenres.includes(genre)) {
          score += 20; // Genre match is very strong for seasonal content
          if (reasons.length < 2) {
            reasons.push(`${genre} genre`);
          }
        }
      }

      // Penalize items that ONLY have weak overview matches (no title, no genre)
      if (
        !hasTitleMatch &&
        !itemGenres.some((g) => holiday.genres.includes(g))
      ) {
        score = Math.floor(score * 0.3); // Heavy penalty for overview-only matches
      }

      // Boost for having an embedding (can expand recommendations)
      if (match.embedding) {
        score += 1;
      }

      // Boost for higher community rating
      if (match.item.communityRating && match.item.communityRating >= 7) {
        score += 2;
      }

      return {
        item: match.item,
        embedding: match.embedding,
        matchScore: score,
        matchReason: reasons.slice(0, 2).join(", ") || "Related content",
      };
    });

    // Sort by score and filter out weak matches
    scoredMatches.sort((a, b) => b.matchScore - a.matchScore);

    // Only keep items with a minimum score (title match or genre match)
    const MIN_SCORE = 10;
    const qualifiedMatches = scoredMatches.filter(
      (m) => m.matchScore >= MIN_SCORE,
    );

    console.log(
      `[Seasonal] Qualified matches (score >= ${MIN_SCORE}): ${qualifiedMatches.length}`,
    );
    if (qualifiedMatches.length > 0) {
      console.log(
        "[Seasonal] Top 3 qualified:",
        qualifiedMatches
          .slice(0, 3)
          .map(
            (m) =>
              `"${m.item.name}" (score: ${m.matchScore}, reason: ${m.matchReason})`,
          ),
      );
    }

    // If we have matches with embeddings, find similar items
    const topMatches = qualifiedMatches.slice(
      0,
      Math.min(5, qualifiedMatches.length),
    );
    const matchesWithEmbeddings = topMatches.filter((m) => m.embedding);

    let similarItems: Array<{
      item: SeasonalRecommendationItem;
      matchScore: number;
      matchReason: string;
    }> = [];

    if (matchesWithEmbeddings.length > 0) {
      // Use embeddings to find similar items
      const qualifiedMatchIds = qualifiedMatches.map((m) => m.item.id);
      const allExcludeIds = [...excludeIds, ...qualifiedMatchIds];

      for (const seedItem of matchesWithEmbeddings.slice(0, 3)) {
        if (!seedItem.embedding) continue;

        const similarity = sql<number>`1 - (${cosineDistance(
          items.embedding,
          seedItem.embedding,
        )})`;

        const similar = await db
          .select({
            item: itemSelect,
            similarity: similarity,
          })
          .from(items)
          .where(
            and(
              eq(items.serverId, serverIdNum),
              isNull(items.deletedAt),
              inArray(items.type, ["Movie", "Series"]),
              isNotNull(items.embedding),
              allExcludeIds.length > 0
                ? notInArray(items.id, allExcludeIds)
                : sql`true`,
            ),
          )
          .orderBy(desc(similarity))
          .limit(5);

        for (const item of similar) {
          const simScore = Number(item.similarity);
          if (simScore > 0.4) {
            similarItems.push({
              item: item.item,
              matchScore: simScore * 5, // Scale to be comparable
              matchReason: `Similar to "${seedItem.item.name}"`,
            });
          }
        }
      }

      // Remove duplicates from similar items
      const seenIds = new Set(qualifiedMatches.map((m) => m.item.id));
      similarItems = similarItems.filter((item) => {
        if (seenIds.has(item.item.id)) return false;
        seenIds.add(item.item.id);
        return true;
      });
    }

    // Combine qualified matches and similar items
    const allResults = [
      ...qualifiedMatches.map((m) => ({
        item: m.item,
        matchScore: m.matchScore,
        matchReason: m.matchReason,
      })),
      ...similarItems,
    ];

    // Sort by score and take top results
    allResults.sort((a, b) => b.matchScore - a.matchScore);
    const finalResults = allResults.slice(0, limit);

    console.log(`[Seasonal] Final results count: ${finalResults.length}`);
    if (finalResults.length > 0) {
      console.log(
        `[Seasonal] Top result: "${finalResults[0].item.name}" (${finalResults[0].matchReason})`,
      );
    }

    if (finalResults.length === 0) {
      console.log("[Seasonal] No results found, returning null");
      return null;
    }

    return {
      holiday,
      items: finalResults,
    };
  } catch (error) {
    console.error("[Seasonal] Error getting seasonal recommendations:", error);
    return null;
  }
}
