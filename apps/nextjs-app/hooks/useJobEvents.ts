"use client";

import { useEffect, useRef } from "react";

export type JobEvent = {
  type: "hello" | "ping" | "started" | "completed" | "failed" | "progress";
  epochMs?: number;
  jobId?: string;
  jobName?: string;
  serverId?: number;
  progress?: { current?: number; total?: number; percent?: number };
  data?: unknown;
  error?: string;
  timestamp: string;
};

export function useJobEvents(options: {
  onJobEvent: (event: JobEvent) => void;
}) {
  const { onJobEvent } = options;

  const lastEventEpochRef = useRef<number | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let reconnectTimer: number | null = null;

    const connect = (since?: number) => {
      const url = new URL("/api/jobs/events", window.location.origin);
      if (since) url.searchParams.set("since", String(since));

      const es = new EventSource(url.toString());
      sourceRef.current = es;

      es.addEventListener("job", (evt) => {
        try {
          const data = JSON.parse((evt as MessageEvent).data) as JobEvent;
          onJobEvent(data);

          if (typeof data.epochMs === "number") {
            lastEventEpochRef.current = data.epochMs;
          } else {
            lastEventEpochRef.current = Date.now();
          }
        } catch {
          // Ignore malformed events
        }
      });

      es.addEventListener("hello", () => {
        // no-op
      });

      es.addEventListener("ping", () => {
        // no-op
      });

      es.onerror = () => {
        es.close();

        if (reconnectTimer) {
          window.clearTimeout(reconnectTimer);
        }

        const sinceEpoch = lastEventEpochRef.current ?? undefined;
        reconnectTimer = window.setTimeout(() => connect(sinceEpoch), 1500);
      };
    };

    connect();

    return () => {
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (sourceRef.current) sourceRef.current.close();
    };
  }, [onJobEvent]);
}

