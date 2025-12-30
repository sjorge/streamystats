"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryParams } from "@/hooks/useQueryParams";
import type { MediaTypeFilter } from "@/lib/db/people-stats";

interface Props {
  currentMediaType: MediaTypeFilter;
}

export function PeopleTypeTabs({ currentMediaType }: Props) {
  const { updateQueryParams, isLoading } = useQueryParams();

  const handleValueChange = (value: string) => {
    updateQueryParams({
      mediaType: value === "all" ? null : value,
    });
  };

  return (
    <Tabs
      value={currentMediaType}
      onValueChange={handleValueChange}
      className="mb-6"
    >
      <TabsList>
        <TabsTrigger value="all" disabled={isLoading}>
          All
        </TabsTrigger>
        <TabsTrigger value="Movie" disabled={isLoading}>
          Movies
        </TabsTrigger>
        <TabsTrigger value="Series" disabled={isLoading}>
          Series
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
