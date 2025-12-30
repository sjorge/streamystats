"use client";

import { Clock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Poster } from "@/app/(app)/servers/[id]/(auth)/dashboard/Poster";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { getRecentlyAddedItems } from "@/lib/db/recently-added";
import type { RecentlyAddedItem } from "@/lib/db/recently-added-types";
import type { ServerPublic } from "@/lib/types";

interface RecentlyAddedProps {
  items: RecentlyAddedItem[];
  server: ServerPublic;
}

export function RecentlyAdded({
  items: initialItems,
  server,
}: RecentlyAddedProps) {
  const [items, setItems] = useState(initialItems);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const formatRuntime = (ticks: number | null) => {
    if (!ticks) return null;
    const minutes = Math.floor(ticks / 600000000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0) {
      return `${hours}h ${remainingMinutes > 0 ? `${remainingMinutes}m` : ""}`;
    }
    return `${minutes}m`;
  };

  useEffect(() => {
    setItems(initialItems);
    setHasMore(true);
  }, [initialItems]);

  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting && !isLoading && hasMore) {
          setIsLoading(true);
          getRecentlyAddedItems(server.id, 20, items.length)
            .then((result) => {
              if (!result || result.length === 0) {
                setHasMore(false);
              } else {
                setItems((prev) => [...prev, ...result]);
              }
            })
            .catch((error) => {
              console.error("Error fetching next page:", error);
            })
            .finally(() => {
              setIsLoading(false);
            });
        }
      },
      {
        root: null,
        rootMargin: "100px",
        threshold: 0.1,
      },
    );

    observer.observe(sentinelRef.current);

    return () => {
      observer.disconnect();
    };
  }, [server.id, items.length, isLoading, hasMore]);

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="rounded-lg border bg-gradient-to-r from-blue-500/10 via-cyan-500/5 to-blue-500/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent opacity-50" />
        <div className="relative z-10">
          <div className="p-4 pb-3">
            <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-background/50 text-blue-500">
                <Clock className="h-4 w-4" />
              </div>
              <span>Recently Added</span>
              <Badge
                variant="outline"
                className="ml-2 text-[10px] bg-blue-500/20 text-blue-400 border-0"
              >
                New
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
              <Sparkles className="h-3 w-3" />
              Latest additions to your library
            </p>
          </div>

          <div className="">
            <ScrollArea dir="ltr" className="w-full py-1">
              <div className="flex gap-4 flex-nowrap px-4 w-max">
                {items.map((item) => (
                  <div key={item.id} className="flex-shrink-0 group relative">
                    <div className="relative w-[152px] sm:w-[184px] py-2">
                      <Link
                        href={`/servers/${server.id}/library/${item.id}`}
                        className="flex flex-col overflow-hidden border border-border bg-card rounded-lg hover:border-primary/50 hover:shadow-xl transition-all duration-300 hover:scale-[1.02] hover:z-10 relative"
                      >
                        <div className="relative">
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent z-10" />
                          <Poster
                            item={item}
                            server={server}
                            width={184}
                            height={240}
                            preferredImageType="Primary"
                            className="w-full h-[208px] sm:h-[256px] rounded-t-lg"
                          />
                          <div className="absolute top-2 left-2 z-20">
                            <Badge className="bg-blue-500/20 text-blue-400 backdrop-blur-sm border-0 shadow-lg text-xs px-1.5 py-0.5">
                              <Clock className="h-2.5 w-2.5 mr-1" />
                              New
                            </Badge>
                          </div>
                        </div>

                        <div className="p-3 space-y-2 bg-gradient-to-b from-card to-card/95">
                          <div>
                            <h3 className="text-foreground text-sm font-bold truncate">
                              {item.name}
                            </h3>
                            <p className="text-muted-foreground text-xs mt-0.5 flex items-center gap-1.5">
                              {item.productionYear}
                              {item.runtimeTicks &&
                                formatRuntime(item.runtimeTicks) && (
                                  <>
                                    <span>•</span>
                                    {formatRuntime(item.runtimeTicks)}
                                  </>
                                )}
                              {item.type === "Series" && (
                                <>
                                  <span>•</span>
                                  Series
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </div>
                  </div>
                ))}
                <div ref={sentinelRef} className="flex-shrink-0 w-4" />
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
