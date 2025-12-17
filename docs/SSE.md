# Server-Sent Events (SSE) Setup

Real-time event streaming from job-server to clients via Next.js proxy.

## Architecture

```
┌─────────────────┐     SSE      ┌─────────────────┐     SSE      ┌─────────────┐
│   Job Server    │ ──────────▶  │  Next.js Proxy  │ ──────────▶  │   Client    │
│   (Bun/Hono)    │              │ /api/jobs/events│              │  EventSource│
│   :3005         │              │     :3000       │              │             │
└─────────────────┘              └─────────────────┘              └─────────────┘
        │
        │ publishJobEvent()
        ▼
   jobEventBus (EventEmitter)
```

## Server-Side

### Publishing Events

Import and call `publishJobEvent` from any job or worker:

```typescript
import { publishJobEvent, nowIsoMicroUtc } from "../events/job-events";

// Job started
publishJobEvent({
  type: "started",
  jobName: "my-job-name",
  serverId: 123,
  timestamp: nowIsoMicroUtc(),
});

// Progress update
publishJobEvent({
  type: "progress",
  jobName: "my-job-name",
  serverId: 123,
  progress: { current: 50, total: 100, percent: 50 },
  timestamp: nowIsoMicroUtc(),
});

// Job completed
publishJobEvent({
  type: "completed",
  jobName: "my-job-name",
  serverId: 123,
  data: { itemsProcessed: 100 },
  timestamp: nowIsoMicroUtc(),
});

// Job failed
publishJobEvent({
  type: "failed",
  jobName: "my-job-name",
  serverId: 123,
  error: "Something went wrong",
  timestamp: nowIsoMicroUtc(),
});
```

### Event Types

```typescript
type JobEvent = {
  type:
    | "hello"           // Connection established
    | "ping"            // Heartbeat (every 15s)
    | "started"         // Job started
    | "completed"       // Job finished successfully
    | "failed"          // Job failed
    | "progress"        // Progress update
    | "anomaly_detected"; // Security anomaly found
  epochMs?: number;     // Auto-added by publishJobEvent
  jobId?: string;
  jobName?: string;
  serverId?: number;
  progress?: { current?: number; total?: number; percent?: number };
  data?: unknown;
  error?: string;
  timestamp: string;
};
```

### Event Buffering

Events are buffered for reconnection support:
- Max 2000 events
- Max 5 minutes age
- Clients can request missed events via `?since=<epochMs>`

## Client-Side

### Basic Hook Usage

```typescript
import { useJobEvents, type JobEvent } from "@/hooks/useJobEvents";

function MyComponent() {
  const handleEvent = useCallback((event: JobEvent) => {
    console.log("Received:", event);
  }, []);

  useJobEvents({ onJobEvent: handleEvent });

  return <div>Listening for events...</div>;
}
```

### Filtering by Server/Job

```typescript
const handleEvent = useCallback((event: JobEvent) => {
  // Only handle events for this server
  if (event.serverId !== myServerId) return;
  
  // Only handle specific job
  if (event.jobName !== "my-job-name") return;
  
  if (event.type === "completed") {
    // Handle completion
  }
}, [myServerId]);
```

### Example: Sync Button with Status

```typescript
function SyncButton({ serverId }: { serverId: number }) {
  const [isRunning, setIsRunning] = useState(false);
  const router = useRouter();

  const handleEvent = useCallback((event: JobEvent) => {
    if (event.serverId !== serverId) return;
    if (event.jobName !== "my-sync-job") return;

    if (event.type === "started") {
      setIsRunning(true);
    } else if (event.type === "completed") {
      setIsRunning(false);
      router.refresh(); // Refresh page data
    } else if (event.type === "failed") {
      setIsRunning(false);
    }
  }, [serverId, router]);

  useJobEvents({ onJobEvent: handleEvent });

  const triggerSync = async () => {
    setIsRunning(true);
    await fetch("/api/jobs/trigger-my-sync", {
      method: "POST",
      body: JSON.stringify({ serverId }),
    });
  };

  return (
    <button onClick={triggerSync} disabled={isRunning}>
      {isRunning ? "Syncing..." : "Sync"}
    </button>
  );
}
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/events` (job-server) | Raw SSE stream |
| `GET /api/jobs/events` (Next.js) | Proxied SSE stream |

### Query Parameters

| Param | Description |
|-------|-------------|
| `since` | Epoch milliseconds. Returns buffered events since this time. |

## Configuration

### Job Server (`index.ts`)

```typescript
Bun.serve({
  port: 3005,
  fetch: app.fetch,
  idleTimeout: 255, // Required for long-lived SSE connections
});
```

### Heartbeat

The server sends a `ping` event every 15 seconds to keep connections alive.

## Testing

### With curl

```bash
# Direct to job-server
curl -N http://localhost:3005/api/events

# Through Next.js proxy
curl -N http://localhost:3000/api/jobs/events
```

### Browser Console

```javascript
const es = new EventSource('/api/jobs/events');
es.addEventListener('job', e => console.log(JSON.parse(e.data)));
es.addEventListener('hello', e => console.log('Connected'));
es.addEventListener('ping', e => console.log('Ping'));
```

## Files

| File | Purpose |
|------|---------|
| `job-server/src/events/job-events.ts` | Event types, publishing, buffering |
| `job-server/src/routes/events-sse.ts` | SSE endpoint (Hono/Bun) |
| `job-server/src/index.ts` | Mounts route, configures idleTimeout |
| `nextjs-app/app/api/jobs/events/route.ts` | Proxy to job-server |
| `nextjs-app/hooks/useJobEvents.ts` | Client hook with auto-reconnect |

## Reconnection

The `useJobEvents` hook automatically:
1. Tracks the last received `epochMs`
2. Reconnects after 1.5s on error
3. Requests missed events via `?since=<epochMs>`

