"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { DirectorActorCombination } from "@/lib/db/people-stats";
import type { ServerPublic } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

interface Props {
  combinations: DirectorActorCombination[];
  server: ServerPublic;
}

function CombinationCard({
  combination,
  server,
}: {
  combination: DirectorActorCombination;
  server: ServerPublic;
}) {
  return (
    <div className="flex-shrink-0 w-[200px] rounded-lg border border-border bg-card p-4 hover:border-primary/50 hover:shadow-lg transition-all duration-200">
      <div className="flex flex-col gap-2">
        <Link
          href={`/servers/${server.id}/actors/${encodeURIComponent(combination.directorId)}`}
          className="hover:text-primary transition-colors"
        >
          <p className="text-xs text-muted-foreground">Director</p>
          <p
            className="text-sm font-semibold truncate"
            title={combination.directorName}
          >
            {combination.directorName}
          </p>
        </Link>
        <div className="text-xs text-muted-foreground text-center">+</div>
        <Link
          href={`/servers/${server.id}/actors/${encodeURIComponent(combination.actorId)}`}
          className="hover:text-primary transition-colors"
        >
          <p className="text-xs text-muted-foreground">Actor</p>
          <p
            className="text-sm font-semibold truncate"
            title={combination.actorName}
          >
            {combination.actorName}
          </p>
        </Link>
      </div>
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-xs font-medium text-primary">
          {formatDuration(combination.totalWatchTime)}
        </p>
        <p className="text-xs text-muted-foreground">
          {combination.itemCount}{" "}
          {combination.itemCount === 1 ? "title" : "titles"} together
        </p>
      </div>
    </div>
  );
}

export function DirectorActorCombinations({ combinations, server }: Props) {
  if (!combinations || combinations.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">
            Popular Director + Actor Combinations
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          No director-actor combinations found yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 pb-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Users className="h-4 w-4 text-primary" />
          </div>
          Popular Director + Actor Combinations
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Most watched director and actor pairings
        </p>
      </div>

      <ScrollArea dir="ltr" className="w-full py-1">
        <div className="flex gap-4 flex-nowrap px-4 pb-4 w-max">
          {combinations.map((combo) => (
            <CombinationCard
              key={`${combo.directorId}-${combo.actorId}`}
              combination={combo}
              server={server}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
