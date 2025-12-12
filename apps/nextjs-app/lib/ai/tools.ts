import { z } from "zod";
import { db, items, sessions, users, libraries } from "@streamystats/database";
import { and, eq, desc, isNotNull, ilike, inArray, sql } from "drizzle-orm";
import { getMostWatchedItems } from "@/lib/db/statistics";
import {
  getSimilarStatistics,
  getSimilarItemsForItem,
} from "@/lib/db/similar-statistics";
import { getUserWatchStats, getUsers } from "@/lib/db/users";

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatItem(
  item: any,
  stats?: { playCount?: number; playDuration?: number }
) {
  const base = {
    id: item.id,
    name: item.name,
    type: item.type,
    year: item.productionYear,
    rating: item.communityRating,
    genres: item.genres,
    overview: item.overview?.slice(0, 200),
    primaryImageTag: item.primaryImageTag,
    seriesId: item.seriesId,
    seriesPrimaryImageTag: item.seriesPrimaryImageTag,
  };
  if (stats) {
    return {
      ...base,
      playCount: stats.playCount,
      watchTime: stats.playDuration
        ? formatDuration(stats.playDuration)
        : undefined,
    };
  }
  return base;
}

export function createChatTools(serverId: number, userId: string) {
  return {
    getUserMostWatchedMovies: {
      description:
        "Get the user's most watched movies ordered by total watch time",
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Number of movies to return"),
      }),
      execute: async ({ limit }: { limit: number }) => {
        console.log("[Tool] getUserMostWatchedMovies called with:", {
          limit,
          serverId,
          userId,
        });
        try {
          const result = await getMostWatchedItems({ serverId, userId });
          console.log("[Tool] getMostWatchedItems returned:", {
            movieCount: result.Movie?.length,
          });
          const movies = result.Movie.slice(0, limit);
          const response = {
            movies: movies.map((m) =>
              formatItem(m, {
                playCount: m.totalPlayCount,
                playDuration: m.totalPlayDuration,
              })
            ),
            message:
              movies.length > 0
                ? `Found ${movies.length} most watched movies`
                : "No movies watched yet",
          };
          console.log("[Tool] getUserMostWatchedMovies returning:", {
            movieCount: response.movies.length,
            message: response.message,
          });
          return response;
        } catch (error) {
          console.error("[Tool] getUserMostWatchedMovies error:", error);
          throw error;
        }
      },
    },

    getUserMostWatchedSeries: {
      description:
        "Get the user's most watched TV series ordered by total watch time",
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Number of series to return"),
      }),
      execute: async ({ limit }: { limit: number }) => {
        const result = await getMostWatchedItems({ serverId, userId });
        const series = result.Series.slice(0, limit);
        return {
          series: series.map((s) =>
            formatItem(s, {
              playCount: s.totalPlayCount,
              playDuration: s.totalPlayDuration,
            })
          ),
          message:
            series.length > 0
              ? `Found ${series.length} most watched series`
              : "No series watched yet",
        };
      },
    },

    getPersonalizedRecommendations: {
      description:
        "Get personalized movie and series recommendations based on user's watch history using AI embeddings. Each recommendation includes a 'reason' field (e.g. 'Because you watched X and Y') and a 'basedOn' array with the watched items that led to this recommendation. Always use this data when presenting recommendations to explain what they're based on.",
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Number of recommendations to return"),
        type: z
          .enum(["Movie", "Series", "all"])
          .optional()
          .default("all")
          .describe("Filter recommendations by type"),
      }),
      execute: async ({
        limit,
        type,
      }: {
        limit: number;
        type: "Movie" | "Series" | "all";
      }) => {
        const recommendations = await getSimilarStatistics(
          serverId,
          userId,
          limit * 2
        );

        const filtered =
          type === "all"
            ? recommendations
            : recommendations.filter((r) => r.item.type === type);

        const enrichedRecs = filtered.slice(0, limit).map((r) => {
          const recGenres = new Set(r.item.genres || []);
          const basedOnItems = r.basedOn.slice(0, 3);

          const sharedGenres = basedOnItems.flatMap((b) =>
            (b.genres || []).filter((g) => recGenres.has(g))
          );
          const uniqueSharedGenres = [...new Set(sharedGenres)];

          let reason = "";
          if (basedOnItems.length > 0) {
            const baseNames = basedOnItems.map((b) => b.name);
            if (basedOnItems.length === 1) {
              reason = `Because you watched "${baseNames[0]}"`;
            } else {
              reason = `Because you watched "${baseNames
                .slice(0, -1)
                .join('", "')}" and "${baseNames[baseNames.length - 1]}"`;
            }
            if (uniqueSharedGenres.length > 0) {
              reason += ` (shared: ${uniqueSharedGenres
                .slice(0, 3)
                .join(", ")})`;
            }
          } else {
            reason = "Popular on this server";
          }

          return {
            ...formatItem(r.item),
            similarityPercent: Math.round(r.similarity * 100),
            reason,
            basedOn: basedOnItems.map((b) => ({
              name: b.name,
              type: b.type,
              genres: b.genres?.slice(0, 3),
            })),
            sharedGenres: uniqueSharedGenres.slice(0, 5),
          };
        });

        return {
          recommendations: enrichedRecs,
          message:
            enrichedRecs.length > 0
              ? `Found ${enrichedRecs.length} personalized recommendations with reasoning`
              : "Unable to generate recommendations. Make sure embeddings are configured and you have watch history.",
        };
      },
    },

    getRecentlyAddedItems: {
      description: "Get recently added movies and series to the library",
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .default(20)
          .describe("Number of items to return"),
        type: z
          .enum(["Movie", "Series", "all"])
          .optional()
          .default("all")
          .describe("Filter by item type"),
      }),
      execute: async ({
        limit,
        type,
      }: {
        limit: number;
        type: "Movie" | "Series" | "all";
      }) => {
        const conditions = [
          eq(items.serverId, serverId),
          isNotNull(items.dateCreated),
        ];
        if (type !== "all") {
          conditions.push(eq(items.type, type));
        } else {
          conditions.push(inArray(items.type, ["Movie", "Series"]));
        }

        const recentItems = await db
          .select()
          .from(items)
          .where(and(...conditions))
          .orderBy(desc(items.dateCreated))
          .limit(limit);

        return {
          items: recentItems.map((item) => ({
            ...formatItem(item),
            addedDate: item.dateCreated?.toISOString().split("T")[0],
          })),
          message: `Found ${recentItems.length} recently added ${
            type === "all" ? "items" : type.toLowerCase() + "s"
          }`,
        };
      },
    },

    searchItems: {
      description: "Search for movies and series by name or genre",
      inputSchema: z.object({
        query: z.string().describe("Search query for item name"),
        type: z
          .enum(["Movie", "Series", "all"])
          .optional()
          .default("all")
          .describe("Filter by type"),
        limit: z.number().optional().default(20).describe("Number of results"),
      }),
      execute: async ({
        query,
        type,
        limit,
      }: {
        query: string;
        type: "Movie" | "Series" | "all";
        limit: number;
      }) => {
        const conditions = [
          eq(items.serverId, serverId),
          ilike(items.name, `%${query}%`),
        ];
        if (type !== "all") {
          conditions.push(eq(items.type, type));
        } else {
          conditions.push(inArray(items.type, ["Movie", "Series"]));
        }

        const results = await db
          .select()
          .from(items)
          .where(and(...conditions))
          .orderBy(desc(items.communityRating))
          .limit(limit);

        return {
          items: results.map((item) => formatItem(item)),
          message:
            results.length > 0
              ? `Found ${results.length} items matching "${query}"`
              : `No items found matching "${query}"`,
        };
      },
    },

    getUserWatchStatistics: {
      description:
        "Get overall watch statistics for the user including total watch time and streaks",
      inputSchema: z.object({}),
      execute: async () => {
        const stats = await getUserWatchStats({ serverId, userId });
        return {
          totalWatchTime: formatDuration(stats.total_watch_time),
          totalWatchTimeSeconds: stats.total_watch_time,
          totalPlays: stats.total_plays,
          longestStreak: stats.longest_streak,
          message: `User has watched ${formatDuration(
            stats.total_watch_time
          )} total with ${stats.total_plays} plays`,
        };
      },
    },

    getAvailableUsers: {
      description:
        "Get list of all users on this server (for finding users to get shared recommendations with)",
      inputSchema: z.object({}),
      execute: async () => {
        const allUsers = await getUsers({ serverId });
        return {
          users: allUsers
            .filter((u) => !u.isHidden && !u.isDisabled)
            .map((u) => ({ id: u.id, name: u.name })),
          message: `Found ${allUsers.length} users`,
        };
      },
    },

    getSharedRecommendations: {
      description:
        "Get movie/series recommendations that both the current user and another user would enjoy based on their overlapping watch history",
      inputSchema: z.object({
        otherUserName: z
          .string()
          .describe(
            "Name of the other user to find shared recommendations with"
          ),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Number of recommendations"),
      }),
      execute: async ({
        otherUserName,
        limit,
      }: {
        otherUserName: string;
        limit: number;
      }) => {
        const otherUser = await db.query.users.findFirst({
          where: and(
            eq(users.serverId, serverId),
            ilike(users.name, `%${otherUserName}%`)
          ),
        });

        if (!otherUser) {
          return {
            recommendations: [],
            message: `Could not find user "${otherUserName}"`,
          };
        }

        const [currentUserRecs, otherUserRecs] = await Promise.all([
          getSimilarStatistics(serverId, userId, 50),
          getSimilarStatistics(serverId, otherUser.id, 50),
        ]);

        const currentUserRecIds = new Set(
          currentUserRecs.map((r) => r.item.id)
        );
        const sharedRecs = otherUserRecs
          .filter((r) => currentUserRecIds.has(r.item.id))
          .slice(0, limit);

        if (sharedRecs.length < limit) {
          const currentUserWatched = await db
            .select({ itemId: sessions.itemId })
            .from(sessions)
            .where(
              and(eq(sessions.serverId, serverId), eq(sessions.userId, userId))
            )
            .groupBy(sessions.itemId);

          const otherUserWatched = await db
            .select({ itemId: sessions.itemId })
            .from(sessions)
            .where(
              and(
                eq(sessions.serverId, serverId),
                eq(sessions.userId, otherUser.id)
              )
            )
            .groupBy(sessions.itemId);

          const currentWatchedIds = new Set(
            currentUserWatched.map((w) => w.itemId)
          );
          const bothWatched = otherUserWatched
            .filter((w) => w.itemId && currentWatchedIds.has(w.itemId))
            .map((w) => w.itemId)
            .filter(Boolean) as string[];

          if (bothWatched.length > 0) {
            const sharedGenres = await db
              .select({ genres: items.genres })
              .from(items)
              .where(inArray(items.id, bothWatched.slice(0, 20)));

            const genreCounts = new Map<string, number>();
            for (const item of sharedGenres) {
              if (item.genres) {
                for (const genre of item.genres) {
                  genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
                }
              }
            }

            const topGenres = [...genreCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([genre]) => genre);

            if (topGenres.length > 0) {
              const existingIds = new Set([
                ...sharedRecs.map((r) => r.item.id),
                ...bothWatched,
              ]);

              const genreRecs = await db
                .select()
                .from(items)
                .where(
                  and(
                    eq(items.serverId, serverId),
                    inArray(items.type, ["Movie", "Series"]),
                    sql`${items.genres} && ARRAY[${sql.join(
                      topGenres.map((g) => sql`${g}`),
                      sql`, `
                    )}]::text[]`
                  )
                )
                .orderBy(desc(items.communityRating))
                .limit(limit - sharedRecs.length + 10);

              const additionalRecs = genreRecs
                .filter((item) => !existingIds.has(item.id))
                .slice(0, limit - sharedRecs.length);

              return {
                recommendations: [
                  ...sharedRecs.map((r) => ({
                    ...formatItem(r.item),
                    sharedMatch: true,
                  })),
                  ...additionalRecs.map((item) => ({
                    ...formatItem(item),
                    sharedMatch: false,
                    basedOnSharedGenres: topGenres,
                  })),
                ],
                otherUser: otherUser.name,
                sharedGenres: topGenres,
                message: `Found recommendations for you and ${otherUser.name}`,
              };
            }
          }
        }

        return {
          recommendations: sharedRecs.map((r) => ({
            ...formatItem(r.item),
            similarity: Math.round(r.similarity * 100),
          })),
          otherUser: otherUser.name,
          message:
            sharedRecs.length > 0
              ? `Found ${sharedRecs.length} shared recommendations for you and ${otherUser.name}`
              : `No strong shared recommendations found. Try watching more content together!`,
        };
      },
    },

    getLibraries: {
      description: "Get list of media libraries on the server",
      inputSchema: z.object({}),
      execute: async () => {
        const libs = await db
          .select()
          .from(libraries)
          .where(eq(libraries.serverId, serverId));

        return {
          libraries: libs.map((l) => ({
            id: l.id,
            name: l.name,
            type: l.type,
          })),
          message: `Found ${libs.length} libraries`,
        };
      },
    },

    getSimilarToItem: {
      description:
        "Get items similar to a specific movie or series. Returns a 'sourceItem' showing what the search was based on, and similar items with a 'reason' field explaining the connection. Use when user asks 'what should I watch after X' or 'find movies like X'. Always mention the sourceItem when presenting results.",
      inputSchema: z.object({
        itemName: z
          .string()
          .describe("Name of the movie or series to find similar items for"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Number of similar items to return"),
      }),
      execute: async ({
        itemName,
        limit,
      }: {
        itemName: string;
        limit: number;
      }) => {
        const foundItems = await db
          .select()
          .from(items)
          .where(
            and(
              eq(items.serverId, serverId),
              ilike(items.name, `%${itemName}%`),
              inArray(items.type, ["Movie", "Series"])
            )
          )
          .orderBy(desc(items.communityRating))
          .limit(1);

        if (foundItems.length === 0) {
          return {
            similar: [],
            message: `Could not find "${itemName}" in the library`,
          };
        }

        const sourceItem = foundItems[0];
        const similarItems = await getSimilarItemsForItem(
          serverId,
          sourceItem.id,
          limit
        );

        const enrichedSimilar = similarItems.map((r) => {
          const sourceGenres = new Set(sourceItem.genres || []);
          const recGenres = r.item.genres || [];
          const sharedGenres = recGenres.filter((g) => sourceGenres.has(g));

          let reason = `Similar to "${sourceItem.name}"`;
          if (sharedGenres.length > 0) {
            reason += ` - both are ${sharedGenres.slice(0, 3).join(", ")} ${
              r.item.type === "Movie" ? "movies" : "series"
            }`;
          }
          if (sourceItem.productionYear && r.item.productionYear) {
            const yearDiff = Math.abs(
              sourceItem.productionYear - r.item.productionYear
            );
            if (yearDiff <= 5) {
              reason += `, from the same era (${r.item.productionYear})`;
            }
          }

          return {
            ...formatItem(r.item),
            similarityPercent: Math.round(r.similarity * 100),
            reason,
            sharedGenres,
          };
        });

        return {
          sourceItem: formatItem(sourceItem),
          similar: enrichedSimilar,
          message:
            enrichedSimilar.length > 0
              ? `Found ${enrichedSimilar.length} items similar to "${sourceItem.name}"`
              : `No similar items found for "${sourceItem.name}". Embeddings may not be configured.`,
        };
      },
    },

    getItemsByGenre: {
      description: "Get movies or series filtered by genre",
      inputSchema: z.object({
        genre: z
          .string()
          .describe("Genre to filter by (e.g., 'Action', 'Comedy', 'Drama')"),
        type: z.enum(["Movie", "Series", "all"]).optional().default("all"),
        limit: z.number().optional().default(20),
      }),
      execute: async ({
        genre,
        type,
        limit,
      }: {
        genre: string;
        type: "Movie" | "Series" | "all";
        limit: number;
      }) => {
        const conditions = [
          eq(items.serverId, serverId),
          sql`${genre} = ANY(${items.genres})`,
        ];
        if (type !== "all") {
          conditions.push(eq(items.type, type));
        } else {
          conditions.push(inArray(items.type, ["Movie", "Series"]));
        }

        const results = await db
          .select()
          .from(items)
          .where(and(...conditions))
          .orderBy(desc(items.communityRating))
          .limit(limit);

        return {
          items: results.map((item) => formatItem(item)),
          genre,
          message:
            results.length > 0
              ? `Found ${results.length} ${
                  type === "all" ? "items" : type.toLowerCase() + "s"
                } in ${genre}`
              : `No items found in genre "${genre}"`,
        };
      },
    },

    getTopRatedItems: {
      description: "Get top rated movies or series by community rating",
      inputSchema: z.object({
        type: z.enum(["Movie", "Series", "all"]).optional().default("all"),
        limit: z.number().optional().default(20),
        minRating: z
          .number()
          .optional()
          .default(7)
          .describe("Minimum rating (0-10)"),
      }),
      execute: async ({
        type,
        limit,
        minRating,
      }: {
        type: "Movie" | "Series" | "all";
        limit: number;
        minRating: number;
      }) => {
        const conditions = [
          eq(items.serverId, serverId),
          isNotNull(items.communityRating),
          sql`${items.communityRating} >= ${minRating}`,
        ];
        if (type !== "all") {
          conditions.push(eq(items.type, type));
        } else {
          conditions.push(inArray(items.type, ["Movie", "Series"]));
        }

        const results = await db
          .select()
          .from(items)
          .where(and(...conditions))
          .orderBy(desc(items.communityRating))
          .limit(limit);

        return {
          items: results.map((item) => formatItem(item)),
          message: `Found ${results.length} top-rated items (${minRating}+ rating)`,
        };
      },
    },
  };
}

export type ChatTools = ReturnType<typeof createChatTools>;
