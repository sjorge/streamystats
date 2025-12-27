"use client";

import type { Item } from "@streamystats/database";
import type { WatchlistWithItemCount } from "@/lib/db/watchlists";
import { WatchlistCard } from "./WatchlistCard";

interface WatchlistWithPreviews extends WatchlistWithItemCount {
  previewItems: Item[];
}

interface WatchlistsGridProps {
  watchlists: WatchlistWithPreviews[];
  serverId: number;
  serverUrl: string;
  currentUserId: string;
}

export function WatchlistsGrid({
  watchlists,
  serverId,
  serverUrl,
  currentUserId,
}: WatchlistsGridProps) {
  if (watchlists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-muted-foreground mb-4">
          <svg
            className="w-16 h-16 mx-auto mb-4 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
          <p className="text-lg font-medium">No watchlists yet</p>
          <p className="text-sm">
            Create your first watchlist to start organizing your media
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {watchlists.map((watchlist) => (
        <WatchlistCard
          key={watchlist.id}
          watchlist={watchlist}
          previewItems={watchlist.previewItems}
          serverId={serverId}
          serverUrl={serverUrl}
          isOwner={watchlist.userId === currentUserId}
        />
      ))}
    </div>
  );
}

