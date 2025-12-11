"use client";

import { Poster } from "@/app/(app)/servers/[id]/(auth)/dashboard/Poster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  hideSeriesRecommendation,
  SeriesRecommendationItem,
} from "@/lib/db/similar-series-statistics";
import { Server } from "@streamystats/database";
import { EyeOffIcon, Monitor } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  data: SeriesRecommendationItem[];
  server: Server;
}

export const SimilarSeriesStatistics = ({ data, server }: Props) => {
  const [recommendations, setRecommendations] = useState(data);
  const [hidingItems, setHidingItems] = useState<Set<string>>(new Set());

  const handleHideRecommendation = async (
    recommendation: SeriesRecommendationItem
  ) => {
    const { item } = recommendation;
    if (!item.id || hidingItems.has(item.id)) {
      console.warn("Item already hidden or missing jellyfin_id", item);
      return;
    }

    const jellyfinId = item.id;
    setHidingItems((prev) => new Set(prev).add(jellyfinId));

    try {
      const result = await hideSeriesRecommendation(server.id, jellyfinId);

      if (result.success) {
        // Remove the recommendation from recommendations
        setRecommendations((prev) =>
          prev.filter((rec) => rec.item.id !== jellyfinId)
        );
        toast.success("Series recommendation hidden successfully");
      } else {
        toast.error(result.error || "Failed to hide series recommendation");
      }
    } catch (error) {
      console.error("Error hiding series recommendation:", error);
      toast.error("Failed to hide series recommendation");
    } finally {
      setHidingItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(jellyfinId);
        return newSet;
      });
    }
  };

  if (
    !recommendations ||
    !Array.isArray(recommendations) ||
    recommendations.length === 0
  ) {
    return (
      <Card>
        <CardHeader className="">
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Recommended Series
          </CardTitle>
          <CardDescription>
            No series recommendations available yet
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col max-w-full">
      <CardHeader className="px-4 sm:px-6 mb-0 pb-0">
        <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          Recommended Series for You
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Based on the series you've been watching
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 m-0 pt-0 max-w-full overflow-hidden">
        {!server.embeddingBaseUrl || !server.embeddingModel ? (
          <div className="flex flex-col gap-2 max-w-full pt-4">
            <Link
              href={`/servers/${server.id}/settings/ai`}
              className="w-full sm:w-auto"
            >
              <Button className="w-full sm:w-auto text-sm" size="sm">
                Set up embedding provider
              </Button>
            </Link>
            <p className="opacity-70 text-xs">
              To get series recommendations, you need to configure an embedding
              provider.
            </p>
          </div>
        ) : (
          <ScrollArea dir="ltr" className="py-4">
            <div className="flex gap-4 min-w-full w-max">
              {recommendations.map((recommendation) => {
                const item = recommendation.item;
                return (
                  <div
                    key={item.id || `${item.name}-${item.productionYear}`}
                    className="flex-shrink-0 group relative"
                  >
                    <Link
                      href={`/servers/${server.id}/library/${item.id}`}
                      className="flex w-[200px] sm:w-[240px] flex-col overflow-hidden border border-border bg-card rounded-lg hover:shadow-lg transition-all"
                    >
                      {/* Poster */}
                      <div className="relative">
                        <Poster
                          item={item}
                          server={server}
                          width={240}
                          height={360}
                          preferredImageType="Primary"
                          className="w-full h-48 sm:h-56 rounded-b-none"
                        />
                      </div>

                      {/* Content */}
                      <div className="flex grow flex-col justify-between p-3">
                        <div>
                          <h3 className="text-foreground text-sm font-semibold truncate text-start">
                            {item.name}
                          </h3>
                          <p className="text-muted-foreground text-xs mt-1 text-start">
                            {item.productionYear && `${item.productionYear} • `}
                            Series
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {item.genres?.slice(0, 2).map((genre: string) => (
                            <Badge
                              key={genre}
                              variant="secondary"
                              className="text-xs px-1.5 py-0"
                            >
                              {genre}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </Link>

                    {/* Hide button */}
                    {item.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleHideRecommendation(recommendation);
                        }}
                        disabled={hidingItems.has(item.id)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs p-1 h-auto"
                      >
                        <EyeOffIcon className="h-3 w-3" />
                        {hidingItems.has(item.id) ? "..." : "Hide"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
