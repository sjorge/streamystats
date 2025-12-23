"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { type JobEvent, useJobEvents } from "./useJobEvents";

const SECURITY_JOB_NAMES = [
  "backfill-activity-locations",
  "geolocate-activities",
  "detect-anomalies",
];

export function useSecurityEvents(serverId: number) {
  const router = useRouter();

  const handleEvent = useCallback(
    (event: JobEvent) => {
      // Only handle events for this server
      if (event.serverId !== serverId) return;

      const isSecurityJob = SECURITY_JOB_NAMES.includes(event.jobName ?? "");
      const isAnomalyEvent = event.type === "anomaly_detected";

      // Refresh on anomaly detection or job completion
      if (isAnomalyEvent || (isSecurityJob && event.type === "completed")) {
        router.refresh();
      }
    },
    [serverId, router],
  );

  useJobEvents({ onJobEvent: handleEvent });
}

