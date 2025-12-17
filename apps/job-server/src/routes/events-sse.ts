import { Hono } from "hono";
import {
  getBufferedEventsSince,
  jobEventBus,
  nowIsoMicroUtc,
  type JobEvent,
} from "../events/job-events";

const app = new Hono();

function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

app.get("/events", (c) => {
  const sinceParam = c.req.query("since");
  const sinceEpoch = sinceParam ? Number(sinceParam) : undefined;

  // Queue-based approach with promise signaling
  const encoder = new TextEncoder();
  const queue: Uint8Array[] = [];
  let waitingResolve: ((value: Uint8Array | null) => void) | null = null;
  let closed = false;

  const enqueue = (msg: string) => {
    const chunk = encoder.encode(msg);
    if (waitingResolve) {
      waitingResolve(chunk);
      waitingResolve = null;
    } else {
      queue.push(chunk);
    }
  };

  const waitForNext = (): Promise<Uint8Array | null> => {
    if (closed) return Promise.resolve(null);
    const next = queue.shift();
    if (next) return Promise.resolve(next);
    return new Promise((resolve) => {
      waitingResolve = resolve;
    });
  };

  // Send hello
  enqueue(formatSSE("hello", { type: "hello", timestamp: nowIsoMicroUtc() }));

  // Send buffered events
  if (sinceEpoch && !Number.isNaN(sinceEpoch)) {
    for (const evt of getBufferedEventsSince(sinceEpoch)) {
      enqueue(formatSSE("job", evt));
    }
  }

  // Listen for job events
  const onJob = (evt: JobEvent) => {
    if (!closed) enqueue(formatSSE("job", evt));
  };
  jobEventBus.on("job", onJob);

  // Heartbeat every 15 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    if (!closed)
      enqueue(formatSSE("ping", { type: "ping", timestamp: nowIsoMicroUtc() }));
  }, 15000);

  const cleanup = () => {
    closed = true;
    clearInterval(heartbeat);
    jobEventBus.off("job", onJob);
    waitingResolve?.(null);
  };

  // Cleanup on disconnect
  c.req.raw.signal.addEventListener("abort", cleanup);

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await waitForNext();
      if (chunk === null || closed) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

export default app;
