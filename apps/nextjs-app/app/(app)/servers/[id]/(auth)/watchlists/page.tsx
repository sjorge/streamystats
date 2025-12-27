import { redirect } from "next/navigation";
import { Container } from "@/components/Container";
import { PageTitle } from "@/components/PageTitle";
import { getServer } from "@/lib/db/server";
import { getMe } from "@/lib/db/users";
import { getWatchlistsForUser, getWatchlistPreviewItems } from "@/lib/db/watchlists";
import { WatchlistsGrid } from "./WatchlistsGrid";
import { CreateWatchlistButton } from "./CreateWatchlistButton";

export default async function WatchlistsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const server = await getServer({ serverId: id });
  const me = await getMe();

  if (!server) {
    redirect("/not-found");
  }

  if (!me) {
    redirect(`/servers/${id}/login`);
  }

  const watchlists = await getWatchlistsForUser({
    serverId: server.id,
    userId: me.id,
  });

  // Get preview items for each watchlist
  const watchlistsWithPreviews = await Promise.all(
    watchlists.map(async (watchlist) => {
      const previewItems = await getWatchlistPreviewItems({
        watchlistId: watchlist.id,
      });
      return {
        ...watchlist,
        previewItems,
      };
    })
  );

  return (
    <Container>
      <div className="flex items-center justify-between mb-6">
        <PageTitle
          title="Watchlists"
          subtitle="Create and manage your personal watchlists"
        />
        <CreateWatchlistButton serverId={server.id} />
      </div>
      <WatchlistsGrid
        watchlists={watchlistsWithPreviews}
        serverId={server.id}
        serverUrl={server.url}
        currentUserId={me.id}
      />
    </Container>
  );
}

