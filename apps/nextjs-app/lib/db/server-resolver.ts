import "server-only";
import { db, type Server, servers } from "@streamystats/database";
import { eq, ilike } from "drizzle-orm";

/**
 * Server identification parameters for external API endpoints.
 * At least one identifier is required.
 */
export interface ServerIdentifier {
  serverId?: string | null;
  serverName?: string | null;
  serverUrl?: string | null;
  jellyfinServerId?: string | null;
}

/**
 * Resolve a server using various identification methods.
 * Priority: serverId > jellyfinId > serverName > serverUrl
 */
export async function resolveServer(
  identifier: ServerIdentifier,
): Promise<Server | undefined> {
  const { serverId, serverName, serverUrl, jellyfinServerId } = identifier;

  // By internal database ID
  if (serverId) {
    const id = parseInt(serverId, 10);
    if (!Number.isNaN(id)) {
      const result = await db
        .select()
        .from(servers)
        .where(eq(servers.id, id))
        .limit(1);
      if (result[0]) return result[0];
    }
  }

  // By Jellyfin server ID (unique identifier from Jellyfin /System/Info)
  if (jellyfinServerId) {
    const result = await db
      .select()
      .from(servers)
      .where(eq(servers.jellyfinId, jellyfinServerId))
      .limit(1);
    if (result[0]) return result[0];
  }

  // By server name (case-insensitive exact match)
  if (serverName) {
    const result = await db
      .select()
      .from(servers)
      .where(ilike(servers.name, serverName))
      .limit(1);
    if (result[0]) return result[0];
  }

  // By server URL (case-insensitive contains match)
  if (serverUrl) {
    const result = await db
      .select()
      .from(servers)
      .where(ilike(servers.url, `%${serverUrl}%`))
      .limit(1);
    if (result[0]) return result[0];
  }

  return undefined;
}

/**
 * Parse server identifier from URL search params
 */
export function parseServerIdentifier(
  searchParams: URLSearchParams,
): ServerIdentifier {
  return {
    serverId: searchParams.get("serverId"),
    serverName: searchParams.get("serverName"),
    serverUrl: searchParams.get("serverUrl"),
    jellyfinServerId: searchParams.get("jellyfinServerId"),
  };
}

/**
 * Check if at least one server identifier is provided
 */
export function hasServerIdentifier(identifier: ServerIdentifier): boolean {
  return !!(
    identifier.serverId ||
    identifier.serverName ||
    identifier.serverUrl ||
    identifier.jellyfinServerId
  );
}
