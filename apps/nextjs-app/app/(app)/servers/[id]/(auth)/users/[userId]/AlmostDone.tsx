"use client";

import { ChevronDown, Tv } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Poster } from "@/app/(app)/servers/[id]/(auth)/dashboard/Poster";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AlmostDoneSeries, SeasonProgress } from "@/lib/db/items";
import type { ServerPublic } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AlmostDoneProps {
  data: AlmostDoneSeries[];
  server: ServerPublic;
}

export function AlmostDone({ data, server }: AlmostDoneProps) {
  if (data.length === 0) {
    return null;
  }

  return (
    <Card className="w-full bg-background/40 backdrop-blur-md border-white/10 shadow-xl overflow-hidden">
      <CardHeader className="pb-3 border-b border-white/5">
        <CardTitle className="text-md font-bold flex items-center gap-3 bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
          <Tv className="w-6 h-6 text-primary" />
          Almost Done
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col divide-y divide-white/5">
          {data.map((item) => (
            <AlmostDoneItem key={item.series.id} item={item} server={server} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AlmostDoneItem({
  item,
  server,
}: {
  item: AlmostDoneSeries;
  server: ServerPublic;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="group flex items-center gap-3 p-3 transition-colors hover:bg-white/5 cursor-pointer">
          <div className="flex-shrink-0">
            <Link
              href={`/servers/${server.id}/library/${item.series.id}`}
              onClick={(e) => e.stopPropagation()}
              className="block overflow-hidden rounded-md shadow-sm transition-transform group-hover:scale-105"
            >
              <Poster
                item={item.series}
                server={server}
                width={60}
                height={90}
                className="h-[90px] w-[60px]"
                preferredImageType="Primary"
              />
            </Link>
          </div>

          <div className="flex flex-1 flex-col gap-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <Link
                href={`/servers/${server.id}/library/${item.series.id}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate font-medium leading-tight group-hover:text-primary transition-colors text-left"
              >
                {item.series.name}
              </Link>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted-foreground">
                  {item.watchedEpisodes}/{item.totalEpisodes}
                </span>
                <span className="text-xs font-medium text-primary">
                  {item.percentComplete}%
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </div>
            </div>

            <SeriesHeatmap seasons={item.seasons} />
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-3 pb-3 pt-0">
          <div className="ml-[72px] space-y-2">
            {item.seasons.map((season) => (
              <SeasonDetail
                key={season.seasonNumber}
                season={season}
                serverId={server.id}
              />
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SeriesHeatmap({ seasons }: { seasons: SeasonProgress[] }) {
  const totalEpisodes = seasons.reduce((sum, s) => sum + s.episodes.length, 0);

  return (
    <TooltipProvider delayDuration={100}>
      <div className="hidden md:flex gap-0.5 w-full">
        {seasons.map((season) => (
          <Tooltip key={season.seasonNumber}>
            <TooltipTrigger asChild>
              <div
                className="flex gap-px"
                style={{
                  flex: `${season.episodes.length} ${season.episodes.length} 0%`,
                }}
              >
                {season.episodes.map((episode) => (
                  <div
                    key={episode.episodeId}
                    className={cn(
                      "flex-1 h-3 min-w-[4px] rounded-[2px] transition-colors",
                      episode.watched ? "bg-primary" : "bg-muted-foreground/20",
                    )}
                  />
                ))}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p>
                Season {season.seasonNumber}: {season.watchedEpisodes}/
                {season.totalEpisodes} watched
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex md:hidden gap-1 flex-wrap">
        {seasons.map((season) => (
          <Tooltip key={season.seasonNumber}>
            <TooltipTrigger asChild>
              <div className="flex gap-px">
                {season.episodes.map((episode) => (
                  <div
                    key={episode.episodeId}
                    className={cn(
                      "w-2 h-3 rounded-[2px] transition-colors",
                      episode.watched ? "bg-primary" : "bg-muted-foreground/20",
                    )}
                  />
                ))}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p>
                Season {season.seasonNumber}: {season.watchedEpisodes}/
                {season.totalEpisodes} watched
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

function SeasonDetail({
  season,
  serverId,
}: {
  season: SeasonProgress;
  serverId: number;
}) {
  const percentComplete =
    season.totalEpisodes > 0
      ? Math.round((season.watchedEpisodes / season.totalEpisodes) * 100)
      : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Season {season.seasonNumber}
        </span>
        <span className="text-muted-foreground">
          {season.watchedEpisodes}/{season.totalEpisodes} ({percentComplete}%)
        </span>
      </div>
      <TooltipProvider delayDuration={100}>
        <div className="hidden md:flex gap-px w-full">
          {season.episodes.map((episode) => (
            <Tooltip key={episode.episodeId}>
              <TooltipTrigger asChild>
                <Link
                  href={`/servers/${serverId}/library/${episode.episodeId}`}
                  className={cn(
                    "flex-1 h-4 min-w-[6px] rounded-[2px] transition-colors cursor-pointer",
                    episode.watched
                      ? "bg-primary hover:bg-primary/80"
                      : "bg-muted-foreground/20 hover:bg-muted-foreground/40",
                  )}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[200px]">
                <p className="font-medium">Episode {episode.episodeNumber}</p>
                {episode.name && (
                  <p className="text-muted-foreground truncate">
                    {episode.name}
                  </p>
                )}
                <p
                  className={
                    episode.watched ? "text-primary" : "text-muted-foreground"
                  }
                >
                  {episode.watched ? "Watched" : "Not watched"}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <div className="flex md:hidden gap-px flex-wrap">
          {season.episodes.map((episode) => (
            <Tooltip key={episode.episodeId}>
              <TooltipTrigger asChild>
                <Link
                  href={`/servers/${serverId}/library/${episode.episodeId}`}
                  className={cn(
                    "w-3 h-4 rounded-[2px] transition-colors cursor-pointer",
                    episode.watched
                      ? "bg-primary hover:bg-primary/80"
                      : "bg-muted-foreground/20 hover:bg-muted-foreground/40",
                  )}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[200px]">
                <p className="font-medium">Episode {episode.episodeNumber}</p>
                {episode.name && (
                  <p className="text-muted-foreground truncate">
                    {episode.name}
                  </p>
                )}
                <p
                  className={
                    episode.watched ? "text-primary" : "text-muted-foreground"
                  }
                >
                  {episode.watched ? "Watched" : "Not watched"}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}
