"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetch } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

type ServerJobState =
  | "running"
  | "queued"
  | "scheduled"
  | "failed"
  | "cancelled"
  | "stopped";

type ServerJobStatusResponse = {
  success: boolean;
  timestamp: string;
  serverId: number;
  jobs: Array<{
    key: string;
    label: string;
    state: ServerJobState;
    updatedAt: string;
    activeSince?: string;
    scheduledFor?: string;
    jobId?: string;
    lastError?: string;
  }>;
};

function getStateBadgeClass(state: ServerJobState): string {
  switch (state) {
    case "running":
      return "text-blue-600 bg-blue-50 border-blue-200";
    case "queued":
      return "text-yellow-600 bg-yellow-50 border-yellow-200";
    case "scheduled":
      return "text-gray-600 bg-gray-50 border-gray-200";
    case "failed":
      return "text-red-600 bg-red-50 border-red-200";
    case "cancelled":
      return "text-gray-600 bg-gray-50 border-gray-200";
    case "stopped":
      return "text-gray-600 bg-gray-50 border-gray-200";
  }
}

async function fetchServerJobStatus(
  serverId: number,
): Promise<ServerJobStatusResponse> {
  const response = await fetch(`/api/jobs/servers/${serverId}/status`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export function ServerJobStatusCard({ serverId }: { serverId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["serverJobStatus", serverId],
    queryFn: () => fetchServerJobStatus(serverId),
    refetchInterval: 5000,
    retry: 2,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Loading…
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Not available.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jobs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.jobs.map((job) => (
          <div
            key={job.key}
            className="flex items-start justify-between gap-3 border rounded-md p-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">{job.label}</div>
              {job.state === "running" && job.activeSince ? (
                <div className="text-xs text-muted-foreground mt-1">
                  running since {new Date(job.activeSince).toLocaleTimeString()}
                </div>
              ) : null}
              {job.state === "scheduled" && job.scheduledFor ? (
                <div className="text-xs text-muted-foreground mt-1">
                  scheduled for{" "}
                  {new Date(job.scheduledFor).toLocaleTimeString()}
                </div>
              ) : null}
              {job.state === "failed" && job.lastError ? (
                <div className="text-xs text-red-600 mt-1 break-words">
                  {job.lastError}
                </div>
              ) : null}
            </div>
            <div className="flex-shrink-0">
              <Badge className={getStateBadgeClass(job.state)}>
                {job.state}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
