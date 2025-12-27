import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { globalSearch, type SearchResults } from "@/lib/db/search";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET /api/search
 * Global search across all entity types
 * 
 * Query params:
 * - q: search query (required)
 * - limit: max results per category (default: 10 for items, 5 for others)
 */
export async function GET(request: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const { session } = auth;
  const searchParams = request.nextUrl.searchParams;

  const query = searchParams.get("q");
  if (!query || query.trim() === "") {
    return jsonResponse({ 
      error: "Search query is required",
      data: {
        items: [],
        users: [],
        watchlists: [],
        activities: [],
        sessions: [],
        total: 0,
      } satisfies SearchResults 
    }, 400);
  }

  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(50, Math.max(1, parseInt(limitParam, 10))) : undefined;

  const results = await globalSearch(
    session.serverId,
    query.trim(),
    session.id,
    limit ? {
      itemLimit: limit,
      userLimit: Math.ceil(limit / 2),
      watchlistLimit: Math.ceil(limit / 2),
      activityLimit: Math.ceil(limit / 2),
      sessionLimit: Math.ceil(limit / 2),
    } : undefined
  );

  return jsonResponse({ data: results });
}

