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
import type { ClientStat } from "@/lib/db/client-statistics";
import { formatDuration } from "@/lib/utils";

interface MostPopularClientsCardProps {
  data: ClientStat[];
}

export const MostPopularClientsCard = ({
  data,
}: MostPopularClientsCardProps) => {
  const popularClients = data
    .filter((item) => item.sessionCount > 0)
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, 10);

  if (popularClients.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Most Popular Clients</CardTitle>
          <CardDescription>Top clients by session count</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[200px]">
          <div className="text-muted-foreground">No client data available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Most Popular Clients</CardTitle>
        <CardDescription>Top clients by session count</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Watch Time</TableHead>
              <TableHead className="text-right">Users</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {popularClients.map((client, index) => (
              <TableRow key={`${client.clientName}-${index}`}>
                <TableCell className="font-medium">
                  {client.clientName || "Unknown"}
                </TableCell>
                <TableCell className="text-right">
                  {client.sessionCount.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {formatDuration(
                    Math.floor(client.totalWatchTime / 60),
                    "minutes",
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {client.uniqueUsers}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
