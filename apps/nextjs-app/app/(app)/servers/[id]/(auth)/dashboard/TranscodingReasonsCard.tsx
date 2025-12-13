"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { CustomBarLabel } from "@/components/ui/CustomBarLabel";
import { CategoryStat } from "@/lib/db/transcoding-statistics";
import { InfoIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

interface TranscodingReasonsCardProps {
  data: CategoryStat[];
}

// Helper function to clean up reason labels
function cleanReasonLabel(label: string): string {
  // Handle stringified JSON arrays like "[\"ContainerNotSupported\"]"
  if (label.startsWith("[") && label.endsWith("]")) {
    try {
      const parsed = JSON.parse(label);
      if (Array.isArray(parsed)) {
        return parsed.join(", ");
      }
    } catch (error) {
      // If parsing fails, return the original label
      console.warn("Failed to parse reason label:", label);
    }
  }

  // Return the label as-is if it's not a JSON array
  return label;
}

export const TranscodingReasonsCard = ({
  data,
}: TranscodingReasonsCardProps) => {
  const reasonsData = data
    .map((item) => ({
      reason: cleanReasonLabel(item.label), // Use label instead of value, and clean it
      count: item.count,
    }))
    .filter((item) => item.count > 0);

  const reasonsConfig = {
    count: {
      label: "Count",
      color: "hsl(var(--chart-2))",
    },
    label: {
      color: "hsl(var(--background))",
    },
  } satisfies ChartConfig;

  // Calculate bar height based on number of items
  const getBarHeight = (dataLength: number) => {
    const minHeightPerBar = 30;
    const maxHeightPerBar = 40;
    return Math.min(
      Math.max(minHeightPerBar, 200 / dataLength),
      maxHeightPerBar
    );
  };

  const maxCount = Math.max(...reasonsData.map((d) => d.count));

  const total = reasonsData.reduce((sum, item) => sum + item.count, 0);
  const reasonsDataWithPercent = reasonsData.map((item) => ({
    ...item,
    labelWithPercent: `${item.reason} - ${
      total > 0 ? ((item.count / total) * 100).toFixed(1) : "0.0"
    }%`,
  }));

  // Find the most common reason (highest count)
  const mostCommonReason =
    data.length > 0
      ? data.reduce((prev, current) =>
          prev.count > current.count ? prev : current
        )
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transcoding Reasons</CardTitle>
        <CardDescription>Why media is being transcoded</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          id="transcoding-reasons"
          config={reasonsConfig}
          className="h-[200px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              accessibilityLayer
              data={reasonsDataWithPercent}
              layout="vertical"
              margin={{
                right: 16,
                left: 0,
                top: 5,
                bottom: 5,
              }}
              barSize={getBarHeight(reasonsDataWithPercent.length)}
            >
              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="reason"
                type="category"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                hide
              />
              <XAxis dataKey="count" type="number" hide />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
              />
              <Bar
                dataKey="count"
                layout="vertical"
                radius={4}
                className="fill-blue-600"
              >
                <LabelList
                  dataKey="labelWithPercent"
                  content={({ x, y, width, height, value }) => (
                    <CustomBarLabel
                      x={Number(x)}
                      y={Number(y)}
                      width={Number(width)}
                      height={Number(height)}
                      value={value}
                      fill="#d6e3ff"
                      fontSize={12}
                      containerWidth={400}
                      alwaysOutside
                    />
                  )}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <InfoIcon className="h-4 w-4" />
          Most common reason:{" "}
          {mostCommonReason ? cleanReasonLabel(mostCommonReason.label) : "N/A"}
        </div>
      </CardFooter>
    </Card>
  );
};
