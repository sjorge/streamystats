"use client";

import { UsersIcon } from "lucide-react";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { UserActivityPerDay } from "@/lib/db/users";

const chartConfig = {
  active_users: {
    label: "Active Users",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

interface Props {
  data: UserActivityPerDay | null;
  startDate: string;
  endDate: string;
}

export const UserActivityChart: React.FC<Props> = ({
  data,
  startDate,
  endDate,
}) => {
  const processedData = React.useMemo(() => {
    if (!data) return [];

    const start = new Date(startDate);
    const end = new Date(endDate);

    const dataMap = new Map<string, number>();
    for (const [date, count] of Object.entries(data)) {
      dataMap.set(date, count);
    }

    const result = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateString = d.toISOString().split("T")[0];
      const formattedDate = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      result.push({
        date: dateString,
        formattedDate: formattedDate,
        active_users: dataMap.get(dateString) || 0,
      });
    }

    return result;
  }, [data, startDate, endDate]);

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UsersIcon className="h-4 w-4" />
            <CardTitle>User Activity</CardTitle>
          </div>
          <CardDescription>Daily active users</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[250px] text-muted-foreground">
            No user activity data available for this time period.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="p-4 md:p-6">
        <div className="flex items-center gap-2">
          <UsersIcon className="h-4 w-4" />
          <CardTitle>User Activity</CardTitle>
        </div>
        <CardDescription>
          Daily active users for the selected period
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer
          id="user-activity-chart"
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <BarChart data={processedData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              allowDecimals={false}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value, _name, entry) => (
                    <div className="flex flex-col gap-1 min-w-[140px]">
                      <div className="text-sm font-medium">
                        {entry?.payload?.formattedDate}
                      </div>
                      <div className="flex flex-row items-center justify-between w-full gap-4">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-[2px]"
                            style={{
                              backgroundColor: chartConfig.active_users.color,
                            }}
                          />
                          <span>Active Users</span>
                        </div>
                        <span className="font-medium ml-auto">{value}</span>
                      </div>
                    </div>
                  )}
                  hideLabel
                />
              }
            />
            <Bar
              dataKey="active_users"
              fill={chartConfig.active_users.color}
              radius={[4, 4, 0, 0]}
              name="Active Users"
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};
