"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ActivityHeatmapProps {
  allTimeHistogram: Record<number, number>;
  weekHistogram: Record<number, number>;
}

function getIntensityClass(value: number, maxValue: number): string {
  if (maxValue === 0 || value === 0) return "bg-muted";
  const ratio = value / maxValue;
  if (ratio > 0.75) return "bg-primary";
  if (ratio > 0.5) return "bg-primary/75";
  if (ratio > 0.25) return "bg-primary/50";
  return "bg-primary/25";
}

function HourGrid({
  histogram,
  maxValue,
  label,
}: {
  histogram: Record<number, number>;
  maxValue: number;
  label: string;
}) {
  const total = Object.values(histogram).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{total} sessions</span>
      </div>
      <TooltipProvider delayDuration={100}>
        <div className="flex gap-0.5">
          {Array.from({ length: 24 }, (_, hour) => {
            const count = histogram[hour] || 0;
            const percentage =
              total > 0 ? ((count / total) * 100).toFixed(1) : "0";
            return (
              <Tooltip key={hour}>
                <TooltipTrigger asChild>
                  <div
                    className={`flex-1 h-8 rounded-sm transition-colors cursor-default ${getIntensityClass(count, maxValue)}`}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <p className="font-medium">{hour}:00 UTC</p>
                  <p>
                    {count} sessions ({percentage}%)
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}

export function ActivityHeatmap({
  allTimeHistogram,
  weekHistogram,
}: ActivityHeatmapProps) {
  // Normalize each histogram to its own max for relative comparison
  const allTimeMax = Math.max(...Object.values(allTimeHistogram), 0);
  const weekMax = Math.max(...Object.values(weekHistogram), 0);

  const hasAllTimeData = Object.values(allTimeHistogram).some((v) => v > 0);
  const hasWeekData = Object.values(weekHistogram).some((v) => v > 0);

  if (!hasAllTimeData && !hasWeekData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Activity Patterns (UTC)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No activity data yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Activity Patterns (UTC)</CardTitle>
        <CardDescription>
          Compare this week's viewing patterns to all-time behavior
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <HourGrid
          histogram={weekHistogram}
          maxValue={weekMax}
          label="This Week"
        />
        <HourGrid
          histogram={allTimeHistogram}
          maxValue={allTimeMax}
          label="All Time"
        />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
          <span>0:00</span>
          <span>6:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-0.5">
            <div className="w-3 h-3 rounded-sm bg-muted" />
            <div className="w-3 h-3 rounded-sm bg-primary/25" />
            <div className="w-3 h-3 rounded-sm bg-primary/50" />
            <div className="w-3 h-3 rounded-sm bg-primary/75" />
            <div className="w-3 h-3 rounded-sm bg-primary" />
          </div>
          <span>More</span>
        </div>
      </CardContent>
    </Card>
  );
}
