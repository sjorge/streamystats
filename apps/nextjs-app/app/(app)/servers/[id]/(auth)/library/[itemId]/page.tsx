import { Container } from "@/components/Container";
import { getItemDetails, getSeasonsAndEpisodes } from "@/lib/db/items";
import { getServer } from "@/lib/db/server";
import { getSimilarSeriesForItem } from "@/lib/db/similar-series-statistics";
import type { SeriesRecommendationItem } from "@/lib/db/similar-series-statistics";
import {
  getSimilarItemsForItem,
  type RecommendationItem,
} from "@/lib/db/similar-statistics";
import { getMe } from "@/lib/db/users";
import { showAdminStatistics } from "@/utils/adminTools";
import { redirect } from "next/navigation";
import { ItemHeader } from "./ItemHeader";
import { ItemMetadata } from "./ItemMetadata";
import { SeasonsAndEpisodes } from "./SeasonsAndEpisodes";
import { SimilarItemsList } from "./SimilarItemsList";

export default async function ItemDetailsPage({
  params,
}: {
  params: Promise<{ id: number; itemId: string }>;
}) {
  const { id, itemId } = await params;
  const server = await getServer({ serverId: id });

  if (!server) {
    redirect("/not-found");
  }

  const me = await getMe();
  const showAdmin = await showAdminStatistics();

  const itemDetails = await getItemDetails({
    itemId,
    userId: showAdmin ? undefined : me?.id,
  });

  if (!itemDetails) {
    redirect("/not-found");
  }

  // Get similar items based on the specific item (not user-based)
  let similarItems: Array<RecommendationItem | SeriesRecommendationItem> = [];

  if (itemDetails.item.type === "Series") {
    similarItems = await getSimilarSeriesForItem(server.id, itemId, 20);
  } else if (itemDetails.item.type === "Movie") {
    similarItems = await getSimilarItemsForItem(server.id, itemId, 20);
  }

  // Get seasons and episodes for series
  const seasons =
    itemDetails.item.type === "Series"
      ? await getSeasonsAndEpisodes({ seriesId: itemId })
      : [];

  return (
    <Container className="flex flex-col w-screen md:w-[calc(100vw-256px)]">
      <div className="space-y-6 pb-10">
        <ItemHeader
          item={itemDetails.item}
          server={server}
          statistics={itemDetails}
          serverId={id}
        />
        <ItemMetadata
          item={itemDetails.item}
          statistics={itemDetails}
          showAdminStats={showAdmin}
          serverId={id}
          itemId={itemId}
        />
        {itemDetails.item.type === "Series" && seasons.length > 0 && (
          <SeasonsAndEpisodes seasons={seasons} serverId={id} server={server} />
        )}
        {(itemDetails.item.type === "Series" ||
          itemDetails.item.type === "Movie") &&
          similarItems.length > 0 && (
            <SimilarItemsList
              items={similarItems}
              server={server}
              currentItemType={itemDetails.item.type}
            />
          )}
      </div>
    </Container>
  );
}
