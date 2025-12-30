"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { type JobEvent, useJobEvents } from "@/hooks/useJobEvents";
import {
  JOB_NAME_TO_KEY,
  type ServerJobState,
  type ServerJobStatusItem,
  type ServerJobStatusResponse,
} from "@/lib/types/job-status";
import { fetch } from "@/lib/utils";

function getStateBadgeVariant(
  state: ServerJobState,
): "default" | "secondary" | "destructive" | "outline" {
  switch (state) {
    case "running":
      return "default";
    case "queued":
      return "secondary";
    case "scheduled":
      return "outline";
    case "failed":
      return "destructive";
    case "cancelled":
    case "stopped":
      return "outline";
  }
}

function getStateBadgeClass(state: ServerJobState): string {
  switch (state) {
    case "running":
      return "bg-blue-600 hover:bg-blue-600";
    case "queued":
      return "bg-amber-500 hover:bg-amber-500 text-white";
    case "scheduled":
      return "bg-slate-500 hover:bg-slate-500 text-white";
    case "failed":
      return "";
    case "cancelled":
      return "bg-slate-400 hover:bg-slate-400";
    case "stopped":
      return "bg-zinc-700 hover:bg-zinc-700 text-zinc-300";
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

function updateJobFromEvent(
  jobs: ServerJobStatusItem[],
  event: JobEvent,
): ServerJobStatusItem[] {
  if (!event.jobName) return jobs;

  const jobKey = JOB_NAME_TO_KEY[event.jobName];
  if (!jobKey) return jobs;

  return jobs.map((job) => {
    if (job.key !== jobKey) return job;

    const now = new Date().toISOString();

    switch (event.type) {
      case "started":
        return {
          ...job,
          state: "running" as const,
          activeSince: now,
          updatedAt: now,
          lastError: undefined,
        };
      case "completed":
        return {
          ...job,
          state: "stopped" as const,
          activeSince: undefined,
          updatedAt: now,
          lastError: undefined,
        };
      case "failed":
        return {
          ...job,
          state: "failed" as const,
          activeSince: undefined,
          updatedAt: now,
          lastError: event.error,
        };
      default:
        return job;
    }
  });
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString();
}

function JobsCardHeader() {
  return (
    <CardHeader>
      <CardTitle>All Jobs</CardTitle>
      <CardDescription>Below are all jobs that can run on the server and their status. Jobs can run in parallell and does not affect one another.</CardDescription>
    </CardHeader>
  );
}

export function ServerJobStatusCard({ serverId }: { serverId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["serverJobStatus", serverId],
    queryFn: () => fetchServerJobStatus(serverId),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 2,
  });

  const [jobs, setJobs] = useState<ServerJobStatusItem[]>([]);

  useEffect(() => {
    if (data?.jobs) {
      setJobs(data.jobs);
    }
  }, [data?.jobs]);

  const handleJobEvent = useCallback(
    (event: JobEvent) => {
      if (event.serverId !== serverId) return;
      if (!event.jobName) return;

      setJobs((prev) => updateJobFromEvent(prev, event));
    },
    [serverId],
  );

  useJobEvents({ onJobEvent: handleJobEvent });

  if (isLoading) {
    return (
      <Card>
        <JobsCardHeader />
        <CardContent className="text-sm text-muted-foreground">
          Loading…
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.success) {
    return (
      <Card>
        <JobsCardHeader />
        <CardContent className="text-sm text-muted-foreground">
          Not available.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <JobsCardHeader />
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.key}>
                <TableCell className="font-medium">{job.label}</TableCell>
                <TableCell>
                  <Badge
                    variant={getStateBadgeVariant(job.state)}
                    className={getStateBadgeClass(job.state)}
                  >
                    {job.state}
                  </Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                  {job.state === "running" && job.activeSince && (
                    <span>Running since {formatTime(job.activeSince)}</span>
                  )}
                  {job.state === "scheduled" && job.scheduledFor && (
                    <span>Scheduled for {formatTime(job.scheduledFor)}</span>
                  )}
                  {job.state === "failed" && job.lastError && (
                    <span className="text-destructive">{job.lastError}</span>
                  )}
                  {job.state === "stopped" && <span>Idle</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
