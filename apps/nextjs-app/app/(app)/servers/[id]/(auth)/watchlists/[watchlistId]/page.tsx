import { redirect } from "next/navigation";
import { Container } from "@/components/Container";
import { getServer } from "@/lib/db/server";
import { getMe } from "@/lib/db/users";
import { getWatchlistWithItems } from "@/lib/db/watchlists";
import { WatchlistHeader } from "./WatchlistHeader";
import { WatchlistItems } from "./WatchlistItems";

export default async function WatchlistDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; watchlistId: string }>;
  searchParams: Promise<{ type?: string; sort?: string }>;
}) {
  const { id, watchlistId } = await params;
  const { type, sort } = await searchParams;

  const server = await getServer({ serverId: id });
  const me = await getMe();

  if (!server) {
    redirect("/not-found");
  }

  if (!me) {
    redirect(`/servers/${id}/login`);
  }

  const watchlistIdNum = parseInt(watchlistId, 10);
  if (isNaN(watchlistIdNum)) {
    redirect(`/servers/${id}/watchlists`);
  }

  const watchlist = await getWatchlistWithItems({
    watchlistId: watchlistIdNum,
    userId: me.id,
    typeFilter: type,
    sortOrder: sort as any,
  });

  if (!watchlist) {
    redirect(`/servers/${id}/watchlists`);
  }

  const isOwner = watchlist.userId === me.id;

  return (
    <Container>
      <WatchlistHeader
        watchlist={watchlist}
        isOwner={isOwner}
      />
      <WatchlistItems
        watchlist={watchlist}
        isOwner={isOwner}
        serverUrl={server.url}
        currentType={type}
        currentSort={sort}
      />
    </Container>
  );
}

