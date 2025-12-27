"use client";

import type { Item } from "@streamystats/database";
import type { WatchlistWithItemCount } from "@/lib/db/watchlists";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Lock, Film, Tv } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface WatchlistCardProps {
  watchlist: WatchlistWithItemCount;
  previewItems: Item[];
  serverId: number;
  serverUrl: string;
  isOwner: boolean;
}

function getItemImageUrl(item: Item, serverUrl: string): string | null {
  if (item.primaryImageTag) {
    return `${serverUrl}/Items/${item.id}/Images/Primary?fillHeight=150&fillWidth=100&quality=80&tag=${item.primaryImageTag}`;
  }
  if (item.seriesId && item.seriesPrimaryImageTag) {
    return `${serverUrl}/Items/${item.seriesId}/Images/Primary?fillHeight=150&fillWidth=100&quality=80&tag=${item.seriesPrimaryImageTag}`;
  }
  return null;
}

function WatchlistPoster({
  items,
  serverUrl,
}: {
  items: Item[];
  serverUrl: string;
}) {
  if (items.length === 0) {
    return (
      <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
        <Film className="w-12 h-12 text-muted-foreground/30" />
      </div>
    );
  }

  // Create 2x2 grid with available items
  const gridItems = items.slice(0, 4);
  const placeholders = 4 - gridItems.length;

  return (
    <div className="aspect-square rounded-lg overflow-hidden grid grid-cols-2 grid-rows-2 gap-0.5 bg-muted">
      {gridItems.map((item) => {
        const imageUrl = getItemImageUrl(item, serverUrl);
        return (
          <div key={item.id} className="relative bg-muted">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={item.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted">
                {item.type === "Movie" ? (
                  <Film className="w-6 h-6 text-muted-foreground/50" />
                ) : (
                  <Tv className="w-6 h-6 text-muted-foreground/50" />
                )}
              </div>
            )}
          </div>
        );
      })}
      {Array.from({ length: placeholders }).map((_, idx) => (
        <div
          key={`placeholder-${idx}`}
          className="bg-muted/50 flex items-center justify-center"
        >
          <div className="w-4 h-4 rounded-full bg-muted-foreground/10" />
        </div>
      ))}
    </div>
  );
}

export function WatchlistCard({
  watchlist,
  previewItems,
  serverId,
  serverUrl,
  isOwner,
}: WatchlistCardProps) {
  const params = useParams();
  const serverIdParam = params.id as string;

  return (
    <Link href={`/servers/${serverIdParam}/watchlists/${watchlist.id}`}>
      <Card className="group hover:shadow-lg transition-all duration-200 hover:scale-[1.02] cursor-pointer overflow-hidden">
        <CardContent className="p-0">
          <WatchlistPoster items={previewItems} serverUrl={serverUrl} />
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">
                  {watchlist.name}
                </h3>
                {watchlist.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {watchlist.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {watchlist.isPublic ? (
                  <Globe className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <Lock className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Badge variant="secondary" className="text-xs">
                {watchlist.itemCount} {watchlist.itemCount === 1 ? "item" : "items"}
              </Badge>
              {watchlist.allowedItemType && (
                <Badge variant="outline" className="text-xs">
                  {watchlist.allowedItemType} only
                </Badge>
              )}
              {!isOwner && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Shared
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

