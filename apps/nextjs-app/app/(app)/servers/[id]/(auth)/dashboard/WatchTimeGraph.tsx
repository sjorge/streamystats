"use client";

import { addDays, startOfDay } from "date-fns";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import type { WatchTimePerType } from "@/lib/db/statistics";
import { formatDuration } from "@/lib/utils";
import { Suspense } from "react";

const chartConfig = {
  Episode: {
    label: "Episodes",
    color: "hsl(var(--chart-1))",
  },
  Movie: {
    label: "Movies",
    color: "hsl(var(--chart-5))",
  },
  Music: {
    label: "Music",
    color: "hsl(var(--chart-2))",
  },
  Other: {
    label: "Other",
    color: "hsl(var(--chart-3))",
  },
} satisfies ChartConfig;

interface Props {
  data?: WatchTimePerType;
  onLoadingChange?: (isLoading: boolean) => void;
  startDate: string;
  endDate: string;
}

function WatchTimeChartView({
  data,
  startDate,
  endDate,
}: {
  data: WatchTimePerType;
  startDate: string;
  endDate: string;
}) {
  const rangeStart = React.useMemo(() => {
    const d = startOfDay(new Date(startDate));
    if (Number.isNaN(d.getTime())) {
      return addDays(startOfDay(new Date()), -7);
    }
    return d;
  }, [startDate]);

  const rangeEnd = React.useMemo(() => {
    const d = startOfDay(new Date(endDate));
    if (Number.isNaN(d.getTime())) {
      return startOfDay(new Date());
    }
    return d;
  }, [endDate]);

  const tickFormatter = React.useCallback((value: string) => {
    const date = new Date(value);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }, []);

  const tooltipFormatter = React.useCallback(
    (value: unknown, name: unknown, item: { color?: string } | undefined) => {
      return (
        <div className="flex flex-row items-center w-full">
          <div
            className="w-2 h-2 rounded-[2px] mr-2"
            style={{ backgroundColor: item?.color }}
          />
          <p className="">{String(name)}</p>
          <p className="ml-auto">{formatDuration(Number(value), "minutes")}</p>
        </div>
      );
    },
    [],
  );

  const filteredData = React.useMemo(() => {
    if (!data) return [];

    const start = rangeStart;
    const end = rangeEnd;

    // Group data by date
    const dataByDate: Record<
      string,
      { Movie: number; Episode: number; Music: number; Other: number }
    > = {};

    // Process the new data structure
    for (const [key, value] of Object.entries(data)) {
      // Parse the composite key: "2024-01-15-movie"
      const lastDashIndex = key.lastIndexOf("-");
      if (lastDashIndex === -1) {
        continue;
      }

      const date = key.substring(0, lastDashIndex);
      const type = key.substring(lastDashIndex + 1);

      // Initialize date entry if it doesn't exist
      if (!dataByDate[date]) {
        dataByDate[date] = { Movie: 0, Episode: 0, Music: 0, Other: 0 };
      }

      // Convert seconds to minutes and assign to appropriate type
      const watchTimeMinutes = Math.floor(value.totalWatchTime / 60);

      if (type === "movie") {
        dataByDate[date].Movie = watchTimeMinutes;
      } else if (type === "episode") {
        dataByDate[date].Episode = watchTimeMinutes;
      } else if (type === "music") {
        dataByDate[date].Music = watchTimeMinutes;
      } else if (type === "other") {
        dataByDate[date].Other = watchTimeMinutes;
      }
    }

    // Create array with all dates in range
    const result = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateString = d.toISOString().split("T")[0];
      const dayData = dataByDate[dateString] || {
        Movie: 0,
        Episode: 0,
        Music: 0,
        Other: 0,
      };

      result.push({
        date: dateString,
        Movie: dayData.Movie,
        Episode: dayData.Episode,
        Music: dayData.Music,
        Other: dayData.Other,
      });
    }

    return result;
  }, [data, rangeStart, rangeEnd]);

  return (
    <ChartContainer
      id="watch-time-graph"
      config={chartConfig}
      className="aspect-auto h-[250px] w-full"
    >
      <BarChart data={filteredData}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={tickFormatter}
        />
        <ChartTooltip
          cursor={false}
          formatter={tooltipFormatter}
          content={<ChartTooltipContent indicator="dashed" />}
        />
        <Bar
          dataKey="Episode"
          fill={chartConfig.Episode.color}
          radius={[4, 4, 0, 0]}
          name="Episode"
        />
        <Bar
          dataKey="Movie"
          fill={chartConfig.Movie.color}
          radius={[4, 4, 0, 0]}
          name="Movie"
        />
        <Bar
          dataKey="Music"
          fill={chartConfig.Music.color}
          radius={[4, 4, 0, 0]}
          name="Music"
        />
        <Bar
          dataKey="Other"
          fill={chartConfig.Other.color}
          radius={[4, 4, 0, 0]}
          name="Other"
        />
      </BarChart>
    </ChartContainer>
  );
}

function LoadingChart() {
  return (
    <div className="aspect-auto h-[250px] w-full flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">
        Loading chart data...
      </div>
    </div>
  );
}

export function WatchTimeGraph({ data, startDate, endDate }: Props) {
  return (
    <Card>
      <CardHeader className="flex md:items-center gap-2 space-y-0 border-b py-5 sm:flex-row p-4 md:p-6">
        <div className="grid flex-1 gap-1">
          <CardTitle>Watch Time Per Day</CardTitle>
          <CardDescription>
            Showing total watch time for the selected period
          </CardDescription>
        </div>
        <div className="mr-4">
          {Object.entries(chartConfig).map(([key, config]) => (
            <div key={key} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-[2px] mr-2"
                style={{ backgroundColor: config.color }}
              />
              <p className="text-xs">{config.label}</p>
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <Suspense fallback={<LoadingChart />}>
          <WatchTimeChartView
            data={data || {}}
            startDate={startDate}
            endDate={endDate}
          />
        </Suspense>
      </CardContent>
    </Card>
  );
}
