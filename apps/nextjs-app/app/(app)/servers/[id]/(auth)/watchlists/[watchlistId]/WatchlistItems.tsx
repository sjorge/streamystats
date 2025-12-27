"use client";

import { useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Film, Tv, Trash2, GripVertical } from "lucide-react";
import type { WatchlistWithItems, WatchlistItemWithDetails } from "@/lib/db/watchlists";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WatchlistItemsProps {
  watchlist: WatchlistWithItems;
  isOwner: boolean;
  serverUrl: string;
  currentType?: string;
  currentSort?: string;
}

function getItemImageUrl(item: WatchlistItemWithDetails["item"], serverUrl: string): string | null {
  if (item.primaryImageTag) {
    return `${serverUrl}/Items/${item.id}/Images/Primary?fillHeight=150&fillWidth=100&quality=80&tag=${item.primaryImageTag}`;
  }
  if (item.seriesId && item.seriesPrimaryImageTag) {
    return `${serverUrl}/Items/${item.seriesId}/Images/Primary?fillHeight=150&fillWidth=100&quality=80&tag=${item.seriesPrimaryImageTag}`;
  }
  return null;
}

function WatchlistItemCard({
  watchlistItem,
  isOwner,
  serverIdParam,
  serverUrl,
  onRemove,
}: {
  watchlistItem: WatchlistItemWithDetails;
  isOwner: boolean;
  serverIdParam: string;
  serverUrl: string;
  onRemove: (itemId: string) => void;
}) {
  const { item } = watchlistItem;
  const [removing, setRemoving] = useState(false);

  const handleRemove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRemoving(true);
    onRemove(item.id);
  };

  const imageUrl = getItemImageUrl(item, serverUrl);

  return (
    <Link href={`/servers/${serverIdParam}/library/${item.id}`}>
      <Card className="flex items-center gap-4 p-3 hover:bg-muted/50 transition-colors group">
        <div className="relative w-16 h-24 rounded overflow-hidden bg-muted shrink-0">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={item.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {item.type === "Movie" ? (
                <Film className="w-6 h-6 text-muted-foreground/50" />
              ) : (
                <Tv className="w-6 h-6 text-muted-foreground/50" />
              )}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate group-hover:text-primary transition-colors">
            {item.name}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              {item.type}
            </Badge>
            {item.productionYear && <span>{item.productionYear}</span>}
            {item.communityRating && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                </svg>
                {item.communityRating.toFixed(1)}
              </span>
            )}
          </div>
          {item.seriesName && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {item.seriesName}
              {item.parentIndexNumber && item.indexNumber && (
                <> - S{item.parentIndexNumber}E{item.indexNumber}</>
              )}
            </p>
          )}
        </div>
        {isOwner && (
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={handleRemove}
            disabled={removing}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        )}
      </Card>
    </Link>
  );
}

export function WatchlistItems({
  watchlist,
  isOwner,
  serverUrl,
  currentType,
  currentSort,
}: WatchlistItemsProps) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const serverIdParam = params.id as string;
  const [items, setItems] = useState(watchlist.items);

  const handleTypeChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set("type", value);
    } else {
      params.delete("type");
    }
    router.push(`?${params.toString()}`);
  };

  const handleSortChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", value);
    router.push(`?${params.toString()}`);
  };

  const handleRemoveItem = async (itemId: string) => {
    const res = await fetch(`/api/watchlists/${watchlist.id}/items/${itemId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setItems(items.filter((i) => i.item.id !== itemId));
      router.refresh();
    }
  };

  // Get unique item types from the watchlist
  const itemTypes = [...new Set(watchlist.items.map((i) => i.item.type))];

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-muted-foreground">
          <Film className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No items yet</p>
          <p className="text-sm">
            Add items from the library to start building your watchlist
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        {!watchlist.allowedItemType && itemTypes.length > 1 && (
          <Select value={currentType ?? "all"} onValueChange={handleTypeChange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {itemTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={currentSort ?? watchlist.defaultSortOrder}
          onValueChange={handleSortChange}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="custom">Custom Order</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="dateAdded">Date Added</SelectItem>
            <SelectItem value="releaseDate">Release Date</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        {items.map((watchlistItem) => (
          <WatchlistItemCard
            key={watchlistItem.id}
            watchlistItem={watchlistItem}
            isOwner={isOwner}
            serverIdParam={serverIdParam}
            serverUrl={serverUrl}
            onRemove={handleRemoveItem}
          />
        ))}
      </div>
    </div>
  );
}

