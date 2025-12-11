"use client";

import { fetch } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";

interface JobStatusResponse {
  success: boolean;
  timestamp: string;
  uptime: number;
  queueStats: {
    fetchExternalData: number;
    generateEmbeddings: number;
    batchProcessPosts: number;
    customProcessing: number;
    syncServerData: number;
    addServer: number;
    generateMediaEmbeddings: number;
    sequentialServerSync: number;
    jellyfinFullSync: number;
    jellyfinUsersSync: number;
    jellyfinLibrariesSync: number;
    jellyfinItemsSync: number;
    jellyfinActivitiesSync: number;
    jellyfinRecentItemsSync: number;
    jellyfinRecentActivitiesSync: number;
    totalQueued: number;
    standardJobsQueued: number;
    jellyfinJobsQueued: number;
  };
  jobStatusMap: {
    [key: string]: "processing" | "completed" | "failed";
  };
  servers: {
    total: number;
    byStatus: {
      pending: number;
      syncing: number;
      completed: number;
      failed: number;
    };
    list: Array<{
      id: number;
      name: string;
      url: string;
      syncStatus: string;
      syncProgress: string;
      syncError?: string;
      lastSyncStarted?: string;
      lastSyncCompleted?: string;
      isHealthy: boolean;
      needsAttention: boolean;
    }>;
  };
  scheduler: {
    enabled: boolean;
    activitySyncInterval: string;
    recentItemsSyncInterval: string;
    runningTasks: string[];
    healthCheck: boolean;
  };
  sessionPoller: {
    enabled: boolean;
    intervalMs: number;
    isRunning: boolean;
    trackedServers: number;
    totalTrackedSessions: number;
    healthCheck: boolean;
  };
  recentResults: Array<{
    id: number;
    jobName: string;
    status: string;
    createdAt: string;
    error?: string;
    processingTime?: number;
  }>;
  systemHealth: {
    overall: "healthy" | "warning" | "unhealthy";
    issues: string[];
    warnings: string[];
  };
}

async function fetchJobStatus(): Promise<JobStatusResponse> {
  const response = await fetch("/api/jobs/status");

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

interface JobStatusMonitorProps {
  refreshInterval?: number;
}

// Map to store toast IDs for each job
type ToastMap = Map<string, string | number>;

export function JobStatusMonitor({
  refreshInterval = 5000,
}: JobStatusMonitorProps) {
  const previousStatusRef = useRef<Record<string, string>>({});
  const activeToastsRef = useRef<ToastMap>(new Map());
  const params = useParams();
  const serverId = params.id ? Number(params.id) : undefined;

  const { data } = useQuery({
    queryKey: ["jobStatus"],
    queryFn: fetchJobStatus,
    refetchInterval: refreshInterval,
    retry: 2,
    retryDelay: 5000,
  });

  useEffect(() => {
    if (!data?.jobStatusMap) return;

    const previousStatus = previousStatusRef.current;
    const activeToasts = activeToastsRef.current;

    Object.entries(data.jobStatusMap).forEach(([jobName, status]) => {
      const prevStatus = previousStatus[jobName];
      const jobLabel = jobName.replace(/-/g, " ");

      // Job started processing
      if (status === "processing" && prevStatus !== "processing") {
        // Dismiss any existing toast for this job
        const existingToastId = activeToasts.get(jobName);
        if (existingToastId) {
          toast.dismiss(existingToastId);
        }
        // Show new loading toast
        const toastId = toast.loading(`Processing ${jobLabel}...`);
        activeToasts.set(jobName, toastId);
      }
      // Job completed
      else if (status === "completed" && prevStatus === "processing") {
        const toastId = activeToasts.get(jobName);
        if (toastId) {
          toast.dismiss(toastId);
          activeToasts.delete(jobName);
        }
        toast.success(`${jobLabel} completed`);
      }
      // Job failed
      else if (status === "failed" && prevStatus === "processing") {
        const toastId = activeToasts.get(jobName);
        if (toastId) {
          toast.dismiss(toastId);
          activeToasts.delete(jobName);
        }
        toast.error(`${jobLabel} failed`);
      }
      // Job is no longer processing (catch-all for edge cases)
      else if (status !== "processing" && activeToasts.has(jobName)) {
        const toastId = activeToasts.get(jobName);
        if (toastId) {
          toast.dismiss(toastId);
          activeToasts.delete(jobName);
        }
      }
    });

    // Update previous status
    previousStatusRef.current = { ...data.jobStatusMap };
  }, [data]);

  return null;
}
