import { type JobEvent, pgListener } from "./pg-listener";

export interface SSEClient {
  id: string;
  serverId: number;
  controller: ReadableStreamDefaultController<Uint8Array>;
  createdAt: Date;
}

/**
 * Manages SSE client connections and routes events to appropriate clients
 */
class SSEConnectionManager {
  private clients: Map<string, SSEClient> = new Map();
  private unsubscribe: (() => void) | null = null;
  private encoder = new TextEncoder();

  constructor() {
    // Subscribe to PostgreSQL notifications
    this.unsubscribe = pgListener.subscribe((event) => {
      this.handleJobEvent(event);
    });
  }

  /**
   * Handle incoming job event from PostgreSQL
   */
  private handleJobEvent(event: JobEvent): void {
    const serverId = Number.parseInt(event.serverId, 10);
    if (Number.isNaN(serverId)) return;

    // Find all clients listening to this server
    for (const client of this.clients.values()) {
      if (client.serverId === serverId) {
        this.sendEvent(client, "job:status", {
          jobName: event.name,
          state: event.state,
          serverId,
        });

        // Send completion event if job finished
        if (
          event.state === "completed" ||
          event.state === "failed" ||
          event.state === "expired"
        ) {
          this.sendEvent(client, "job:complete", {
            jobName: event.name,
            state: event.state,
            serverId,
          });
        }
      }
    }
  }

  /**
   * Send an SSE event to a client
   */
  private sendEvent(client: SSEClient, eventType: string, data: unknown): void {
    try {
      const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
      client.controller.enqueue(this.encoder.encode(message));
    } catch {
      // Client might be disconnected, remove it
      this.removeClient(client.id);
    }
  }

  /**
   * Register a new SSE client
   */
  addClient(
    serverId: number,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): string {
    const id = crypto.randomUUID();
    const client: SSEClient = {
      id,
      serverId,
      controller,
      createdAt: new Date(),
    };

    this.clients.set(id, client);
    console.info(
      `[sse-manager] Client connected: ${id} for server ${serverId} (total: ${this.clients.size})`,
    );

    // Send initial connection event
    this.sendEvent(client, "connected", { serverId, clientId: id });

    return id;
  }

  /**
   * Remove a client connection
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      console.info(
        `[sse-manager] Client disconnected: ${clientId} (total: ${this.clients.size})`,
      );
    }
  }

  /**
   * Send a ping to all clients (heartbeat)
   */
  pingAll(): void {
    for (const client of this.clients.values()) {
      this.sendEvent(client, "ping", null);
    }
  }

  /**
   * Get number of connected clients
   */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Get clients for a specific server
   */
  getClientsForServer(serverId: number): SSEClient[] {
    return Array.from(this.clients.values()).filter(
      (c) => c.serverId === serverId,
    );
  }

  /**
   * Manually emit an event to all clients for a server
   * Useful for triggering events from other parts of the app
   */
  emitToServer(serverId: number, eventType: string, data: unknown): void {
    for (const client of this.clients.values()) {
      if (client.serverId === serverId) {
        this.sendEvent(client, eventType, data);
      }
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.clients.clear();
  }
}

// Singleton instance with hot reload support
const globalForSSE = globalThis as unknown as {
  sseManager: SSEConnectionManager | undefined;
};

export const sseManager = globalForSSE.sseManager ?? new SSEConnectionManager();

if (process.env.NODE_ENV !== "production") {
  globalForSSE.sseManager = sseManager;
}

// Start heartbeat interval
let heartbeatInterval: NodeJS.Timeout | null = null;

if (typeof globalForSSE.sseManager === "undefined" || !heartbeatInterval) {
  heartbeatInterval = setInterval(() => {
    sseManager.pingAll();
  }, 30000); // Ping every 30 seconds
}
