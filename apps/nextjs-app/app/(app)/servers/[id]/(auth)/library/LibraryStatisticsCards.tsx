"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Clock,
  Film,
  Folder,
  HardDrive,
  Music,
  Play,
  PlaySquare,
  Tv,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PerLibraryStatistics } from "@/lib/db/library-statistics";
import { formatBytes, formatDuration, ticksToSeconds } from "@/lib/utils";

interface Props {
  data: PerLibraryStatistics[];
}

const getLibraryIcon = (type: string) => {
  switch (type) {
    case "movies":
      return Film;
    case "tvshows":
      return Tv;
    case "music":
      return Music;
    default:
      return Folder;
  }
};

const LibraryStatCard: React.FC<{ stats: PerLibraryStatistics }> = ({
  stats,
}) => {
  const Icon = getLibraryIcon(stats.libraryType);
  const isTvLibrary = stats.libraryType === "tvshows";
  const isMovieLibrary = stats.libraryType === "movies";

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">
          {stats.libraryName}
        </CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground capitalize">
            {stats.libraryType}
          </span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {/* Row 1: Total Time + Total Files */}
        <div className="grid grid-cols-2 gap-4">
          <StatItem
            label="Total Time"
            value={formatDuration(ticksToSeconds(stats.totalRuntimeTicks))}
            icon={Clock}
          />
          <StatItem
            label="Total Files"
            value={formatNumber(stats.totalFiles)}
            icon={Folder}
          />
        </div>

        {/* Row 2: Library Size */}
        <div className="grid grid-cols-2 gap-4">
          <StatItem
            label="Library Size"
            value={formatBytes(stats.totalSizeBytes)}
            icon={HardDrive}
          />
          <StatItem
            label="Total Plays"
            value={formatNumber(stats.totalPlays)}
            icon={Play}
          />
        </div>

        {/* Row 3: Playback + Last Activity */}
        <div className="grid grid-cols-2 gap-4">
          <StatItem
            label="Total Playback"
            value={formatDuration(stats.totalPlaybackSeconds)}
            icon={PlaySquare}
          />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Last Activity</p>
            <p className="text-sm font-medium truncate">
              {stats.lastActivityTime
                ? formatDistanceToNow(new Date(stats.lastActivityTime), {
                    addSuffix: true,
                  })
                : "Never"}
            </p>
          </div>
        </div>

        {/* Row 4: Last Played */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Last Played</p>
          <p className="text-sm font-medium truncate">
            {stats.lastPlayedItemName || "Nothing yet"}
          </p>
        </div>

        {/* Row 5: Type-specific counts */}
        <div className="pt-2 border-t">
          {isTvLibrary ? (
            <div className="flex justify-between text-sm">
              <span>
                <span className="font-medium">{stats.seriesCount}</span>{" "}
                <span className="text-muted-foreground">Series</span>
              </span>
              <span>
                <span className="font-medium">{stats.seasonsCount}</span>{" "}
                <span className="text-muted-foreground">Seasons</span>
              </span>
              <span>
                <span className="font-medium">{stats.episodesCount}</span>{" "}
                <span className="text-muted-foreground">Episodes</span>
              </span>
            </div>
          ) : isMovieLibrary ? (
            <div className="text-sm">
              <span className="font-medium">{stats.moviesCount}</span>{" "}
              <span className="text-muted-foreground">Movies</span>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {stats.totalFiles} items
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const StatItem: React.FC<{
  label: string;
  value: string;
  icon: React.ElementType;
}> = ({ label, value, icon: Icon }) => (
  <div className="space-y-1">
    <div className="flex items-center gap-1">
      <Icon className="h-3 w-3 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
    <p className="text-sm font-medium truncate">{value}</p>
  </div>
);

export const LibraryStatisticsCards: React.FC<Props> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No libraries found
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {data.map((stats) => (
        <LibraryStatCard key={stats.libraryId} stats={stats} />
      ))}
    </div>
  );
};

function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
