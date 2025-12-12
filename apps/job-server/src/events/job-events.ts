import { EventEmitter } from "events";

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

export const jobEventBus = new EventEmitter();
jobEventBus.setMaxListeners(200);

export function nowIsoMicroUtc(): string {
  // Date.toISOString() gives milliseconds. Pad to microseconds to match project rules.
  return new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

type BufferedEvent = Omit<JobEvent, "epochMs"> & { epochMs: number };

const MAX_BUFFER_SIZE = 2000;
const MAX_BUFFER_AGE_MS = 5 * 60 * 1000;

const buffer: BufferedEvent[] = [];

export function publishJobEvent(event: JobEvent): void {
  const epochMs = Date.now();

  const buffered: BufferedEvent = {
    ...event,
    timestamp: event.timestamp || nowIsoMicroUtc(),
    epochMs,
  };

  buffer.push(buffered);

  // Trim by age
  const minEpoch = epochMs - MAX_BUFFER_AGE_MS;
  while (buffer.length > 0 && buffer[0].epochMs < minEpoch) {
    buffer.shift();
  }

  // Trim by size
  while (buffer.length > MAX_BUFFER_SIZE) {
    buffer.shift();
  }

  jobEventBus.emit("job", buffered);
}

export function getBufferedEventsSince(epochMs: number): JobEvent[] {
  return buffer.filter((e) => e.epochMs >= epochMs);
}

