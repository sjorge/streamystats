"use client";

import { Clock, Film, Play, TrendingUp } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { PersonStats } from "@/lib/db/people-stats";
import type { ServerPublic } from "@/lib/types";
import { PersonCard } from "./PersonCard";

export type IconType = "clock" | "play" | "film" | "trending";

const iconMap = {
  clock: Clock,
  play: Play,
  film: Film,
  trending: TrendingUp,
} as const;

interface Props {
  title: string;
  description: string;
  iconType: IconType;
  people: PersonStats[];
  server: ServerPublic;
  variant: "watchtime" | "playcount";
  emptyMessage: string;
}

export function PeopleSection({
  title,
  description,
  iconType,
  people,
  server,
  variant,
  emptyMessage,
}: Props) {
  const Icon = iconMap[iconType];

  if (!people || people.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 pb-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          {title}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>

      <ScrollArea dir="ltr" className="w-full py-1">
        <div className="flex gap-4 flex-nowrap px-4 pb-4 w-max">
          {people.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              server={server}
              variant={variant}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
