"use client";

import {
  hideRecommendation,
  RecommendationItem,
} from "@/lib/db/similar-statistics";
import { Server } from "@streamystats/database";
import { Film } from "lucide-react";
import { RecommendationsSection } from "./RecommendationsSection";

interface Props {
  data: RecommendationItem[];
  server: Server;
}

export const SimilarStatistics = ({ data, server }: Props) => {
  const formatRuntime = (ticks: number | null) => {
    if (!ticks) {
      return null;
    }
    const minutes = Math.floor(ticks / 600000000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0) {
      return `${hours}h ${remainingMinutes > 0 ? `${remainingMinutes}m` : ""}`;
    }
    return `${minutes}m`;
  };

  return (
    <RecommendationsSection
      title="Recommended Movies for You"
      description="Personalized recommendations based on your viewing history"
      icon={Film}
      recommendations={data}
      server={server}
      onHideRecommendation={hideRecommendation}
      formatRuntime={formatRuntime}
      emptyMessage="No recommendations available yet"
    />
  );
};
