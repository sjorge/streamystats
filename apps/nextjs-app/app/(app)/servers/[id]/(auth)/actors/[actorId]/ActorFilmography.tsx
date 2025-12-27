"use client";

import type { Server } from "@streamystats/database/schema";
import { Calendar, Clock, Film, Play, Tv } from "lucide-react";
import Link from "next/link";
import { Poster } from "@/app/(app)/servers/[id]/(auth)/dashboard/Poster";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/utils";
import type { ActorItem } from "@/lib/db/actors";

interface ActorFilmographyProps {
  items: ActorItem[];
  server: Server;
  serverId: number;
}

function FilmographyItem({
  actorItem,
  server,
  serverId,
}: {
  actorItem: ActorItem;
  server: Server;
  serverId: number;
}) {
  const { item, role, totalViews, totalWatchTime } = actorItem;

  return (
    <Link href={`/servers/${serverId}/library/${item.id}`}>
      <div className="group flex gap-4 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/50 transition-colors">
        <div className="flex-shrink-0 w-20">
          <Poster
            item={item}
            server={server}
            width={200}
            height={300}
            preferredImageType="Primary"
            className="shadow-md"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {item.name}
              </h3>
              {role && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  as {role}
                </p>
              )}
            </div>
            <Badge
              variant="outline"
              className="flex-shrink-0 gap-1 text-xs"
            >
              {item.type === "Series" ? (
                <Tv className="w-3 h-3" />
              ) : (
                <Film className="w-3 h-3" />
              )}
              {item.type}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
            {item.productionYear && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {item.productionYear}
              </span>
            )}
            {totalViews > 0 && (
              <span className="flex items-center gap-1">
                <Play className="w-3 h-3" />
                {totalViews} view{totalViews === 1 ? "" : "s"}
              </span>
            )}
            {totalWatchTime > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(totalWatchTime)}
              </span>
            )}
          </div>

          {item.genres && item.genres.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {item.genres.slice(0, 3).map((genre) => (
                <Badge key={genre} variant="secondary" className="text-xs">
                  {genre}
                </Badge>
              ))}
              {item.genres.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{item.genres.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ActorFilmography({
  items,
  server,
  serverId,
}: ActorFilmographyProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Film className="w-4 h-4" />
          Filmography ({items.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((actorItem) => (
            <FilmographyItem
              key={actorItem.item.id}
              actorItem={actorItem}
              server={server}
              serverId={serverId}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

