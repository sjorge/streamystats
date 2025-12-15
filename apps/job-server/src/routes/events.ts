import express from "express";
import {
  getBufferedEventsSince,
  jobEventBus,
  nowIsoMicroUtc,
  type JobEvent,
} from "../events/job-events";

const router = express.Router();

function writeSse(res: express.Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

router.get("/events", async (req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Some proxies require an initial write
  res.write("\n");

  writeSse(res, "hello", {
    type: "hello",
    timestamp: nowIsoMicroUtc(),
  });

  const sinceParam =
    typeof req.query.since === "string" ? req.query.since : undefined;
  const sinceEpoch = sinceParam ? Number(sinceParam) : undefined;

  if (sinceEpoch && !Number.isNaN(sinceEpoch)) {
    const buffered = getBufferedEventsSince(sinceEpoch);
    for (const evt of buffered) {
      writeSse(res, "job", evt);
    }
  }

  const onJob = (evt: JobEvent) => {
    writeSse(res, "job", evt);
  };

  jobEventBus.on("job", onJob);

  const heartbeat = setInterval(() => {
    writeSse(res, "ping", { type: "ping", timestamp: nowIsoMicroUtc() });
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    jobEventBus.off("job", onJob);
  });
});

export default router;

