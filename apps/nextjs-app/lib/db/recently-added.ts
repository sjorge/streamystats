"use server";

import { db } from "@streamystats/database";
import { items } from "@streamystats/database/schema";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
} from "drizzle-orm";
import { getExclusionSettings } from "./exclusions";
import type { RecentlyAddedItem } from "./recently-added-types";

const itemSelect = {
  id: items.id,
  name: items.name,
  type: items.type,
  productionYear: items.productionYear,
  runtimeTicks: items.runtimeTicks,
  genres: items.genres,
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
  imageBlurHashes: items.imageBlurHashes,
  dateCreated: items.dateCreated,
} as const;

/**
 * Get recently added items (Movies and Series) for a server.
 * Items are sorted by dateCreated descending.
 */
export async function getRecentlyAddedItems(
  serverId: string | number,
  limit = 20,
  offset = 0,
): Promise<RecentlyAddedItem[]> {
  const serverIdNum = Number(serverId);

  const exclusions = await getExclusionSettings(serverIdNum);
  const { excludedLibraryIds } = exclusions;

  const results = await db
    .select(itemSelect)
    .from(items)
    .where(
      and(
        eq(items.serverId, serverIdNum),
        isNull(items.deletedAt),
        isNotNull(items.dateCreated),
        inArray(items.type, ["Movie", "Series"]),
        excludedLibraryIds.length > 0
          ? notInArray(items.libraryId, excludedLibraryIds)
          : undefined,
      ),
    )
    .orderBy(desc(items.dateCreated))
    .limit(limit)
    .offset(offset);

  return results;
}
