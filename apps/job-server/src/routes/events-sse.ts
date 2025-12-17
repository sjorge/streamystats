import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  getBufferedEventsSince,
  jobEventBus,
  nowIsoMicroUtc,
  type JobEvent,
} from "../events/job-events";

const app = new Hono();

app.get("/events", (c) => {
  const sinceParam = c.req.query("since");
  const sinceEpoch = sinceParam ? Number(sinceParam) : undefined;

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: "hello",
      data: JSON.stringify({ type: "hello", timestamp: nowIsoMicroUtc() }),
    });

    if (sinceEpoch && !Number.isNaN(sinceEpoch)) {
      for (const evt of getBufferedEventsSince(sinceEpoch)) {
        await stream.writeSSE({ event: "job", data: JSON.stringify(evt) });
      }
    }

    const onJob = async (evt: JobEvent) => {
      await stream.writeSSE({ event: "job", data: JSON.stringify(evt) });
    };
    jobEventBus.on("job", onJob);

    const heartbeat = setInterval(async () => {
      await stream.writeSSE({
        event: "ping",
        data: JSON.stringify({ type: "ping", timestamp: nowIsoMicroUtc() }),
      });
    }, 30000);

    stream.onAbort(() => {
      clearInterval(heartbeat);
      jobEventBus.off("job", onJob);
    });

    while (true) {
      await stream.sleep(60000);
    }
  });
});

export default app;
