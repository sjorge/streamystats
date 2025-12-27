"use server";

import { and, eq, isNull, sql, desc, or, ilike } from "drizzle-orm";
import { db } from "@streamystats/database";
import {
  items,
  users,
  activities,
  watchlists,
  sessions,
  libraries,
} from "@streamystats/database/schema";

/**
 * Generic search result type that can represent any searchable entity
 */
export type SearchResult = {
  id: string;
  type: "item" | "user" | "watchlist" | "activity" | "session" | "actor";
  subtype?: string; // e.g., "Movie", "Series", "Episode" for items, "Actor", "Director" for actors
  title: string;
  subtitle?: string;
  imageId?: string;
  imageTag?: string;
  href: string;
  metadata?: Record<string, string>;
  rank?: number;
};

/**
 * Grouped search results by category
 */
export type SearchResults = {
  items: SearchResult[];
  users: SearchResult[];
  watchlists: SearchResult[];
  activities: SearchResult[];
  sessions: SearchResult[];
  actors: SearchResult[];
  total: number;
};

/**
 * Convert search query to tsquery format for PostgreSQL full-text search
 * Handles simple queries with plainto_tsquery for basic searches
 */
function buildTsQuery(query: string): string {
  // Clean and prepare the query
  const cleaned = query.trim().replace(/[^\w\s]/g, " ").trim();
  if (!cleaned) return "";
  
  // Use plainto_tsquery for simple text search (handles spaces automatically)
  return cleaned;
}

/**
 * Search items (movies, series, episodes, etc.)
 */
async function searchItems(
  serverId: number,
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  const searchQuery = buildTsQuery(query);
  if (!searchQuery) return [];

  // Combine full-text search with ILIKE fallback for better results
  const results = await db
    .select({
      id: items.id,
      name: items.name,
      type: items.type,
      seriesName: items.seriesName,
      seasonName: items.seasonName,
      indexNumber: items.indexNumber,
      parentIndexNumber: items.parentIndexNumber,
      productionYear: items.productionYear,
      primaryImageTag: items.primaryImageTag,
      seriesPrimaryImageTag: items.seriesPrimaryImageTag,
      seriesId: items.seriesId,
      rank: sql<number>`CASE 
        WHEN search_vector IS NOT NULL 
        THEN ts_rank_cd(search_vector, plainto_tsquery('english', ${searchQuery}))
        ELSE 0 
      END`.as("rank"),
    })
    .from(items)
    .where(
      and(
        eq(items.serverId, serverId),
        isNull(items.deletedAt),
        or(
          sql`search_vector @@ plainto_tsquery('english', ${searchQuery})`,
          ilike(items.name, `%${query}%`),
          ilike(items.seriesName, `%${query}%`)
        )
      )
    )
    .orderBy(desc(sql`rank`), desc(items.communityRating))
    .limit(limit);

  return results.map((item) => {
    let subtitle = "";
    if (item.type === "Episode" && item.seriesName) {
      subtitle = item.seriesName;
      if (item.parentIndexNumber !== null && item.indexNumber !== null) {
        subtitle += ` - S${item.parentIndexNumber}E${item.indexNumber}`;
      }
    } else if (item.type === "Season" && item.seriesName) {
      subtitle = item.seriesName;
    } else if (item.productionYear) {
      subtitle = String(item.productionYear);
    }

    // Use series image for episodes if available
    const imageId = item.type === "Episode" && item.seriesId ? item.seriesId : item.id;
    const imageTag = item.type === "Episode" && item.seriesPrimaryImageTag 
      ? item.seriesPrimaryImageTag 
      : item.primaryImageTag;

    return {
      id: item.id,
      type: "item" as const,
      subtype: item.type,
      title: item.name,
      subtitle,
      imageId,
      imageTag: imageTag ?? undefined,
      href: `/library/${item.id}`,
      rank: item.rank,
    };
  });
}

/**
 * Search users
 */
async function searchUsers(
  serverId: number,
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  const searchQuery = buildTsQuery(query);
  if (!searchQuery) return [];

  const results = await db
    .select({
      id: users.id,
      name: users.name,
      isAdministrator: users.isAdministrator,
      rank: sql<number>`CASE 
        WHEN search_vector IS NOT NULL 
        THEN ts_rank_cd(search_vector, plainto_tsquery('english', ${searchQuery}))
        ELSE 0 
      END`.as("rank"),
    })
    .from(users)
    .where(
      and(
        eq(users.serverId, serverId),
        or(
          sql`search_vector @@ plainto_tsquery('english', ${searchQuery})`,
          ilike(users.name, `%${query}%`)
        )
      )
    )
    .orderBy(desc(sql`rank`))
    .limit(limit);

  return results.map((user) => ({
    id: user.id,
    type: "user" as const,
    title: user.name,
    subtitle: user.isAdministrator ? "Administrator" : "User",
    href: `/users/${user.id}`,
    rank: user.rank,
  }));
}

/**
 * Search watchlists
 */
async function searchWatchlists(
  serverId: number,
  query: string,
  userId: string,
  limit: number = 5
): Promise<SearchResult[]> {
  const searchQuery = buildTsQuery(query);
  if (!searchQuery) return [];

  const results = await db
    .select({
      id: watchlists.id,
      name: watchlists.name,
      description: watchlists.description,
      isPublic: watchlists.isPublic,
      ownerId: watchlists.userId,
      rank: sql<number>`CASE 
        WHEN search_vector IS NOT NULL 
        THEN ts_rank_cd(search_vector, plainto_tsquery('english', ${searchQuery}))
        ELSE 0 
      END`.as("rank"),
    })
    .from(watchlists)
    .where(
      and(
        eq(watchlists.serverId, serverId),
        or(
          eq(watchlists.userId, userId),
          eq(watchlists.isPublic, true)
        ),
        or(
          sql`search_vector @@ plainto_tsquery('english', ${searchQuery})`,
          ilike(watchlists.name, `%${query}%`)
        )
      )
    )
    .orderBy(desc(sql`rank`))
    .limit(limit);

  return results.map((wl) => ({
    id: String(wl.id),
    type: "watchlist" as const,
    title: wl.name,
    subtitle: wl.description ?? (wl.isPublic ? "Public" : "Private"),
    href: `/watchlists/${wl.id}`,
    metadata: wl.ownerId === userId ? { owner: "You" } : undefined,
    rank: wl.rank,
  }));
}

/**
 * Search activities
 */
async function searchActivities(
  serverId: number,
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  const searchQuery = buildTsQuery(query);
  if (!searchQuery) return [];

  const results = await db
    .select({
      id: activities.id,
      name: activities.name,
      shortOverview: activities.shortOverview,
      type: activities.type,
      date: activities.date,
      severity: activities.severity,
      rank: sql<number>`CASE 
        WHEN search_vector IS NOT NULL 
        THEN ts_rank_cd(search_vector, plainto_tsquery('english', ${searchQuery}))
        ELSE 0 
      END`.as("rank"),
    })
    .from(activities)
    .where(
      and(
        eq(activities.serverId, serverId),
        or(
          sql`search_vector @@ plainto_tsquery('english', ${searchQuery})`,
          ilike(activities.name, `%${query}%`)
        )
      )
    )
    .orderBy(desc(sql`rank`), desc(activities.date))
    .limit(limit);

  return results.map((activity) => ({
    id: activity.id,
    type: "activity" as const,
    subtype: activity.type,
    title: activity.name,
    subtitle: activity.shortOverview ?? activity.type,
    href: `/activities?search=${encodeURIComponent(activity.name)}`,
    metadata: {
      severity: activity.severity,
      date: activity.date.toISOString(),
    },
    rank: activity.rank,
  }));
}

/**
 * Search sessions/history (uses ILIKE since sessions don't have search_vector)
 */
async function searchSessions(
  serverId: number,
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  const results = await db
    .select({
      id: sessions.id,
      itemName: sessions.itemName,
      seriesName: sessions.seriesName,
      userName: sessions.userName,
      deviceName: sessions.deviceName,
      clientName: sessions.clientName,
      startTime: sessions.startTime,
      itemId: sessions.itemId,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.serverId, serverId),
        or(
          ilike(sessions.itemName, `%${query}%`),
          ilike(sessions.seriesName, `%${query}%`),
          ilike(sessions.userName, `%${query}%`),
          ilike(sessions.deviceName, `%${query}%`),
          ilike(sessions.clientName, `%${query}%`)
        )
      )
    )
    .orderBy(desc(sessions.startTime))
    .limit(limit);

  return results.map((session) => ({
    id: session.id,
    type: "session" as const,
    title: session.itemName ?? "Unknown",
    subtitle: `${session.userName} - ${session.clientName ?? session.deviceName ?? "Unknown device"}`,
    href: `/history?search=${encodeURIComponent(session.itemName ?? "")}`,
    metadata: {
      date: session.startTime?.toISOString() ?? "",
    },
  }));
}

// Person type from Jellyfin people array
interface Person {
  Id: string;
  Name: string;
  Role?: string;
  Type: string;
  PrimaryImageTag?: string;
}

/**
 * Search actors/people across all items
 */
async function searchActors(
  serverId: number,
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  // Search for items that have matching people in their people JSONB field
  const results = await db
    .select({
      people: items.people,
    })
    .from(items)
    .where(
      and(
        eq(items.serverId, serverId),
        isNull(items.deletedAt),
        sql`${items.people} IS NOT NULL`
      )
    )
    .limit(500); // Get a batch of items to search through

  // Extract unique actors matching the query
  const actorMap = new Map<string, Person>();
  const queryLower = query.toLowerCase();

  for (const row of results) {
    if (!row.people) continue;

    let people: Person[] = [];
    try {
      if (Array.isArray(row.people)) {
        people = row.people as Person[];
      } else if (typeof row.people === "object") {
        people = Object.values(row.people as Record<string, Person>);
      }
    } catch {
      continue;
    }

    for (const person of people) {
      if (!person?.Id || !person?.Name) continue;
      if (actorMap.has(person.Id)) continue;
      
      if (person.Name.toLowerCase().includes(queryLower)) {
        actorMap.set(person.Id, person);
        if (actorMap.size >= limit) break;
      }
    }
    if (actorMap.size >= limit) break;
  }

  return Array.from(actorMap.values()).map((person) => ({
    id: person.Id,
    type: "actor" as const,
    subtype: person.Type,
    title: person.Name,
    subtitle: person.Type,
    imageId: person.Id,
    imageTag: person.PrimaryImageTag,
    href: `/actors/${encodeURIComponent(person.Id)}`,
  }));
}

/**
 * Global search across all entity types
 */
export async function globalSearch(
  serverId: number,
  query: string,
  userId: string,
  options: {
    itemLimit?: number;
    userLimit?: number;
    watchlistLimit?: number;
    activityLimit?: number;
    sessionLimit?: number;
    actorLimit?: number;
  } = {}
): Promise<SearchResults> {
  const {
    itemLimit = 10,
    userLimit = 5,
    watchlistLimit = 5,
    activityLimit = 5,
    sessionLimit = 5,
    actorLimit = 5,
  } = options;

  if (!query.trim()) {
    return {
      items: [],
      users: [],
      watchlists: [],
      activities: [],
      sessions: [],
      actors: [],
      total: 0,
    };
  }

  // Execute all searches in parallel
  const [itemResults, userResults, watchlistResults, activityResults, sessionResults, actorResults] = 
    await Promise.all([
      searchItems(serverId, query, itemLimit),
      searchUsers(serverId, query, userLimit),
      searchWatchlists(serverId, query, userId, watchlistLimit),
      searchActivities(serverId, query, activityLimit),
      searchSessions(serverId, query, sessionLimit),
      searchActors(serverId, query, actorLimit),
    ]);

  const total = 
    itemResults.length + 
    userResults.length + 
    watchlistResults.length + 
    activityResults.length + 
    sessionResults.length +
    actorResults.length;

  return {
    items: itemResults,
    users: userResults,
    watchlists: watchlistResults,
    activities: activityResults,
    sessions: sessionResults,
    actors: actorResults,
    total,
  };
}

