"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ClientPerUserStat } from "@/lib/db/client-statistics";
import { formatDuration } from "@/lib/utils";

interface ClientsPerUserCardProps {
  data: ClientPerUserStat[];
}

export const ClientsPerUserCard = ({ data }: ClientsPerUserCardProps) => {
  const clientsPerUser = data
    .filter((item) => item.sessionCount > 0)
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, 50); // Top 50

  if (clientsPerUser.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Clients per User</CardTitle>
          <CardDescription>Which clients each user uses</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[200px]">
          <div className="text-muted-foreground">No data available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clients per User</CardTitle>
        <CardDescription>Which clients each user uses</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Watch Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientsPerUser.map((item, index) => (
                <TableRow key={`${item.userId}-${item.clientName}-${index}`}>
                  <TableCell className="font-medium">
                    {item.userName || "Unknown User"}
                  </TableCell>
                  <TableCell>{item.clientName || "Unknown"}</TableCell>
                  <TableCell className="text-right">
                    {item.sessionCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatDuration(
                      Math.floor(item.totalWatchTime / 60),
                      "minutes",
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
