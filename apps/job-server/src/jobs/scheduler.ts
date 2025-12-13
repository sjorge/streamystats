import * as cron from "node-cron";
import { db, servers, jobResults, items } from "@streamystats/database";
import { eq, and, sql, ne, or, isNull, lt } from "drizzle-orm";
import { getJobQueue } from "./queue";
import { JELLYFIN_JOB_NAMES } from "../jellyfin/workers";

class SyncScheduler {
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
  private enabled: boolean = false;
  private activitySyncInterval: string = "*/1 * * * *"; // Every 5 minutes
  private recentItemsSyncInterval: string = "*/1 * * * *"; // Every 5 minutes
  private userSyncInterval: string = "*/1 * * * *"; // Every 5 minutes
  private peopleSyncInterval: string = "*/15 * * * *"; // Every 15 minutes
  private embeddingsSyncInterval: string = "*/15 * * * *"; // Every 15 minutes
  private jobCleanupInterval: string = "*/1 * * * *"; // Every 5 minutes
  private oldJobCleanupInterval: string = "0 3 * * *"; // Daily at 3 AM
  private fullSyncInterval: string = "0 2 * * *"; // Daily at 2 AM

  constructor() {
    // Auto-start if not explicitly disabled
    const autoStart = Bun.env.SCHEDULER_AUTO_START !== "false";
    if (autoStart) {
      this.startWithCleanup();
    }
  }

  /**
   * Start scheduler with initial cleanup of stale states
   */
  private async startWithCleanup(): Promise<void> {
    await this.performStartupCleanup();
    this.start();
  }

  /**
   * Reset any servers stuck in "syncing" status on startup
   * This handles cases where the server crashed mid-sync
   */
  private async performStartupCleanup(): Promise<void> {
    try {
      console.log("Performing startup cleanup...");

      // Reset all servers stuck in "syncing" status
      const result = await db
        .update(servers)
        .set({
          syncStatus: "pending",
          syncError: null,
          updatedAt: new Date(),
        })
        .where(eq(servers.syncStatus, "syncing"))
        .returning({ id: servers.id, name: servers.name });

      if (result.length > 0) {
        console.log(
          `Startup cleanup: Reset ${
            result.length
          } server(s) from "syncing" to "pending": ${result
            .map((s) => s.name)
            .join(", ")}`
        );
      } else {
        console.log("Startup cleanup: No stuck servers found");
      }
    } catch (error) {
      console.error("Error during startup cleanup:", error);
    }
  }

  /**
   * Start the scheduler with current configuration
   */
  start(): void {
    if (this.enabled) {
      console.log("Scheduler is already running");
      return;
    }

    this.enabled = true;

    try {
      // Activity sync task
      const activityTask = cron.schedule(this.activitySyncInterval, () => {
        this.triggerActivitySync().catch((error) => {
          console.error("Error during scheduled activity sync:", error);
        });
      });

      // Recent items sync task
      const recentItemsTask = cron.schedule(
        this.recentItemsSyncInterval,
        () => {
          this.triggerRecentItemsSync().catch((error) => {
            console.error("Error during scheduled recent items sync:", error);
          });
        }
      );

      // User sync task
      const userSyncTask = cron.schedule(this.userSyncInterval, () => {
        this.triggerUserSync().catch((error) => {
          console.error("Error during scheduled user sync:", error);
        });
      });

      // People sync task (background backfill)
      const peopleSyncTask = cron.schedule(this.peopleSyncInterval, () => {
        this.triggerPeopleSync().catch((error) => {
          console.error("Error during scheduled people sync:", error);
        });
      });

      // Embeddings sync task (background backfill)
      const embeddingsSyncTask = cron.schedule(
        this.embeddingsSyncInterval,
        () => {
          this.triggerEmbeddingsSync().catch((error) => {
            console.error("Error during scheduled embeddings sync:", error);
          });
        }
      );

      // Job cleanup task for stale embedding jobs
      const jobCleanupTask = cron.schedule(this.jobCleanupInterval, () => {
        this.triggerJobCleanup().catch((error) => {
          console.error("Error during scheduled job cleanup:", error);
        });
      });

      // Old job cleanup task - removes job results older than 10 days
      const oldJobCleanupTask = cron.schedule(
        this.oldJobCleanupInterval,
        () => {
          this.triggerOldJobCleanup().catch((error) => {
            console.error("Error during scheduled old job cleanup:", error);
          });
        }
      );

      // Full sync task - daily complete sync
      const fullSyncTask = cron.schedule(this.fullSyncInterval, () => {
        this.triggerFullSync().catch((error) => {
          console.error("Error during scheduled full sync:", error);
        });
      });

      this.scheduledTasks.set("activity-sync", activityTask);
      this.scheduledTasks.set("recent-items-sync", recentItemsTask);
      this.scheduledTasks.set("user-sync", userSyncTask);
      this.scheduledTasks.set("people-sync", peopleSyncTask);
      this.scheduledTasks.set("embeddings-sync", embeddingsSyncTask);
      this.scheduledTasks.set("job-cleanup", jobCleanupTask);
      this.scheduledTasks.set("old-job-cleanup", oldJobCleanupTask);
      this.scheduledTasks.set("full-sync", fullSyncTask);

      // Start all tasks
      activityTask.start();
      recentItemsTask.start();
      userSyncTask.start();
      peopleSyncTask.start();
      embeddingsSyncTask.start();
      jobCleanupTask.start();
      oldJobCleanupTask.start();
      fullSyncTask.start();

      console.log("Scheduler started successfully");
      console.log(`Activity sync: ${this.activitySyncInterval}`);
      console.log(`Recent items sync: ${this.recentItemsSyncInterval}`);
      console.log(`User sync: ${this.userSyncInterval}`);
      console.log(`People sync: ${this.peopleSyncInterval}`);
      console.log(`Embeddings sync: ${this.embeddingsSyncInterval}`);
      console.log(`Job cleanup: ${this.jobCleanupInterval}`);
      console.log(`Old job cleanup: ${this.oldJobCleanupInterval}`);
      console.log(`Full sync: ${this.fullSyncInterval}`);
    } catch (error) {
      console.error("Failed to start scheduler:", error);
      this.enabled = false;
      throw error;
    }
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.enabled) {
      console.log("Scheduler is not running");
      return;
    }

    // Stop and clear all scheduled tasks
    for (const [name, task] of this.scheduledTasks) {
      try {
        task.stop();
        task.destroy();
        console.log(`Stopped scheduled task: ${name}`);
      } catch (error) {
        console.error(`Error stopping task ${name}:`, error);
      }
    }

    this.scheduledTasks.clear();
    this.enabled = false;
    console.log("Scheduler stopped");
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(config: {
    enabled?: boolean;
    activitySyncInterval?: string;
    recentItemsSyncInterval?: string;
    userSyncInterval?: string;
    peopleSyncInterval?: string;
    embeddingsSyncInterval?: string;
    jobCleanupInterval?: string;
    oldJobCleanupInterval?: string;
    fullSyncInterval?: string;
  }): void {
    const wasEnabled = this.enabled;

    if (config.activitySyncInterval) {
      this.activitySyncInterval = config.activitySyncInterval;
    }

    if (config.recentItemsSyncInterval) {
      this.recentItemsSyncInterval = config.recentItemsSyncInterval;
    }

    if (config.userSyncInterval) {
      this.userSyncInterval = config.userSyncInterval;
    }

    if (config.peopleSyncInterval) {
      this.peopleSyncInterval = config.peopleSyncInterval;
    }

    if (config.embeddingsSyncInterval) {
      this.embeddingsSyncInterval = config.embeddingsSyncInterval;
    }

    if (config.jobCleanupInterval) {
      this.jobCleanupInterval = config.jobCleanupInterval;
    }

    if (config.oldJobCleanupInterval) {
      this.oldJobCleanupInterval = config.oldJobCleanupInterval;
    }

    if (config.fullSyncInterval) {
      this.fullSyncInterval = config.fullSyncInterval;
    }

    if (config.enabled !== undefined && config.enabled !== this.enabled) {
      if (config.enabled) {
        this.start();
      } else {
        this.stop();
      }
    } else if (wasEnabled && this.enabled) {
      // Restart with new configuration if it was running
      this.stop();
      this.start();
    }
  }

  /**
   * Get servers available for periodic sync
   * Returns servers that are not syncing, or have been syncing for more than 30 minutes (stale)
   */
  private async getServersForPeriodicSync() {
    return await db
      .select()
      .from(servers)
      .where(
        or(
          ne(servers.syncStatus, "syncing"),
          // Include servers stuck in "syncing" for more than 30 minutes
          and(
            eq(servers.syncStatus, "syncing"),
            or(
              isNull(servers.lastSyncStarted),
              lt(servers.lastSyncStarted, sql`NOW() - INTERVAL '30 minutes'`)
            )
          )
        )
      );
  }

  /**
   * Trigger activity sync for all active servers
   */
  private async triggerActivitySync(): Promise<void> {
    try {
      console.log("[scheduler] trigger=activity-sync");

      // Get all servers that are not currently syncing (or stale syncing)
      const activeServers = await this.getServersForPeriodicSync();

      if (activeServers.length === 0) {
        console.log("No active servers found for activity sync");
        return;
      }

      const boss = await getJobQueue();

      // Queue activity sync jobs for each server
      for (const server of activeServers) {
        try {
          await boss.send(
            JELLYFIN_JOB_NAMES.RECENT_ACTIVITIES_SYNC,
            {
              serverId: server.id,
              options: {
                activityOptions: {
                  limit: 100, // Default limit
                },
              },
            },
            {
              expireInMinutes: 30, // Job expires after 30 minutes
              retryLimit: 1, // Retry once if it fails
              retryDelay: 60, // Wait 60 seconds before retrying
            }
          );

          console.log(
            `[scheduler] queued=activity-sync server=${server.name} serverId=${server.id}`
          );
        } catch (error) {
          console.error(
            `Failed to queue activity sync for server ${server.name}:`,
            error
          );
        }
      }

      console.log(
        `[scheduler] completed=activity-sync serverCount=${activeServers.length}`
      );
    } catch (error) {
      console.error("Error during periodic activity sync trigger:", error);
    }
  }

  /**
   * Trigger recently added items sync for all active servers
   */
  private async triggerRecentItemsSync(): Promise<void> {
    try {
      console.log("[scheduler] trigger=recent-items-sync");

      // Get all servers that are not currently syncing (or stale syncing)
      const activeServers = await this.getServersForPeriodicSync();

      if (activeServers.length === 0) {
        console.log("No active servers found for recently added items sync");
        return;
      }

      const boss = await getJobQueue();

      // Queue recently added items sync jobs for each server
      for (const server of activeServers) {
        try {
          await boss.send(
            JELLYFIN_JOB_NAMES.RECENT_ITEMS_SYNC,
            {
              serverId: server.id,
              options: {
                itemOptions: {
                  recentItemsLimit: 100, // Default limit
                },
              },
            },
            {
              expireInMinutes: 30, // Job expires after 30 minutes
              retryLimit: 1, // Retry once if it fails
              retryDelay: 60, // Wait 60 seconds before retrying
            }
          );

          console.log(
            `[scheduler] queued=recent-items-sync server=${server.name} serverId=${server.id}`
          );
        } catch (error) {
          console.error(
            `Failed to queue recently added items sync for server ${server.name}:`,
            error
          );
        }
      }

      console.log(
        `[scheduler] completed=recent-items-sync serverCount=${activeServers.length}`
      );
    } catch (error) {
      console.error(
        "Error during periodic recently added items sync trigger:",
        error
      );
    }
  }

  /**
   * Trigger user sync for all active servers
   */
  private async triggerUserSync(): Promise<void> {
    try {
      console.log("[scheduler] trigger=user-sync");

      // Get all servers that are not currently syncing (or stale syncing)
      const activeServers = await this.getServersForPeriodicSync();

      if (activeServers.length === 0) {
        console.log("No active servers found for user sync");
        return;
      }

      const boss = await getJobQueue();

      // Queue user sync jobs for each server
      for (const server of activeServers) {
        try {
          await boss.send(
            JELLYFIN_JOB_NAMES.USERS_SYNC,
            {
              serverId: server.id,
              options: {
                userOptions: {
                  // User sync specific options can be added here
                },
              },
            },
            {
              expireInMinutes: 30, // Job expires after 30 minutes
              retryLimit: 1, // Retry once if it fails
              retryDelay: 60, // Wait 60 seconds before retrying
            }
          );

          console.log(
            `[scheduler] queued=user-sync server=${server.name} serverId=${server.id}`
          );
        } catch (error) {
          console.error(
            `Failed to queue user sync for server ${server.name}:`,
            error
          );
        }
      }

      console.log(
        `[scheduler] completed=user-sync serverCount=${activeServers.length}`
      );
    } catch (error) {
      console.error("Error during periodic user sync trigger:", error);
    }
  }

  /**
   * Trigger people sync for all active servers (background backfill).
   * Uses a per-server singletonKey so it can be scheduled frequently without enqueuing duplicates.
   */
  private async triggerPeopleSync(): Promise<void> {
    try {
      const activeServers = await this.getServersForPeriodicSync();

      if (activeServers.length === 0) {
        return;
      }

      const boss = await getJobQueue();

      for (const server of activeServers) {
        try {
          await boss.send(
            JELLYFIN_JOB_NAMES.PEOPLE_SYNC,
            { serverId: server.id },
            {
              singletonKey: `jellyfin-people-sync-${server.id}`,
              expireInMinutes: 60,
              retryLimit: 1,
              retryDelay: 60,
            }
          );
        } catch (error) {
          console.error(
            `Failed to queue people sync for server ${server.name}:`,
            error
          );
        }
      }
    } catch (error) {
      console.error("Error during periodic people sync trigger:", error);
    }
  }

  /**
   * Trigger embeddings generation for all eligible servers.
   * Only runs for servers with autoGenerateEmbeddings enabled and valid embedding config.
   * Skips if there is already a queued/active embeddings job for that server.
   */
  private async triggerEmbeddingsSync(): Promise<void> {
    try {
      const activeServers = await this.getServersForPeriodicSync();

      const eligibleServers = activeServers.filter(
        (server) => server.autoGenerateEmbeddings
      );

      if (eligibleServers.length === 0) {
        return;
      }

      const boss = await getJobQueue();

      for (const server of eligibleServers) {
        try {
          if (!server.embeddingProvider) {
            continue;
          }

          if (!server.embeddingBaseUrl || !server.embeddingModel) {
            continue;
          }

          if (
            server.embeddingProvider === "openai-compatible" &&
            !server.embeddingApiKey
          ) {
            continue;
          }

          const remainingCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(items)
            .where(
              and(
                eq(items.serverId, server.id),
                eq(items.processed, false),
                sql`${items.type} IN ('Movie', 'Series')`
              )
            );

          const remaining = Number(remainingCount[0]?.count ?? 0);
          if (remaining <= 0) {
            continue;
          }

          let hasActiveJob = false;
          try {
            const existing = await db.execute(sql`
              SELECT 1
              FROM pgboss.job
              WHERE name = 'generate-item-embeddings'
                AND state IN ('created', 'active', 'retry')
                AND data->>'serverId' = ${server.id.toString()}
              LIMIT 1
            `);
            hasActiveJob = existing.length > 0;
          } catch {
            // If pgboss schema isn't available for some reason, fall back to enqueuing.
            hasActiveJob = false;
          }

          if (hasActiveJob) {
            continue;
          }

          await boss.send(
            "generate-item-embeddings",
            {
              serverId: server.id,
              provider: server.embeddingProvider,
              config: {
                baseUrl: server.embeddingBaseUrl,
                apiKey: server.embeddingApiKey ?? undefined,
                model: server.embeddingModel,
                dimensions: server.embeddingDimensions || 1536,
              },
            },
            {
              expireInMinutes: 60,
              retryLimit: 1,
              retryDelay: 60,
            }
          );
        } catch (error) {
          console.error(
            `Failed to queue embeddings sync for server ${server.name}:`,
            error
          );
        }
      }
    } catch (error) {
      console.error("Error during periodic embeddings sync trigger:", error);
    }
  }

  /**
   * Trigger full sync for all active servers
   */
  private async triggerFullSync(): Promise<void> {
    try {
      console.log("Triggering scheduled daily full sync...");

      // Get all servers that are not currently syncing (or stale syncing)
      const activeServers = await this.getServersForPeriodicSync();

      if (activeServers.length === 0) {
        console.log("No active servers found for full sync");
        return;
      }

      const boss = await getJobQueue();

      // Queue full sync jobs for each server
      for (const server of activeServers) {
        try {
          await boss.send(
            JELLYFIN_JOB_NAMES.FULL_SYNC,
            {
              serverId: server.id,
              options: {
                // Full sync options - will sync users, libraries, items, and activities
                userOptions: {},
                libraryOptions: {},
                itemOptions: {
                  // Use job-server defaults (and env overrides) to avoid hammering Jellyfin
                },
                activityOptions: {
                  pageSize: 5000,
                  maxPages: 5000,
                  concurrency: 5,
                  apiRequestDelayMs: 100,
                },
              },
            },
            {
              expireInMinutes: 360, // Job expires after 6 hours (longer for full sync)
              retryLimit: 1, // Retry once if it fails
              retryDelay: 300, // Wait 5 minutes before retrying
            }
          );

          console.log(
            `Queued scheduled full sync for server: ${server.name} (ID: ${server.id})`
          );
        } catch (error) {
          console.error(
            `Failed to queue full sync for server ${server.name}:`,
            error
          );
        }
      }

      console.log(
        `Scheduled daily full sync queued for ${activeServers.length} servers`
      );
    } catch (error) {
      console.error("Error during scheduled full sync trigger:", error);
    }
  }

  /**
   * Reset servers stuck in "syncing" status for more than 30 minutes
   */
  private async resetStaleSyncStatus(): Promise<void> {
    try {
      const result = await db
        .update(servers)
        .set({
          syncStatus: "failed",
          syncError:
            "Sync timed out - status was stuck in syncing for more than 30 minutes",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(servers.syncStatus, "syncing"),
            or(
              isNull(servers.lastSyncStarted),
              lt(servers.lastSyncStarted, sql`NOW() - INTERVAL '30 minutes'`)
            )
          )
        )
        .returning({ id: servers.id, name: servers.name });

      if (result.length > 0) {
        console.log(
          `Reset stale sync status for ${result.length} server(s): ${result
            .map((s) => s.name)
            .join(", ")}`
        );
      }
    } catch (error) {
      console.error("Error resetting stale sync status:", error);
    }
  }

  /**
   * Trigger cleanup of stale embedding jobs
   */
  private async triggerJobCleanup(): Promise<void> {
    try {
      // First, reset any servers stuck in "syncing" status
      await this.resetStaleSyncStatus();

      // Find all processing embedding jobs older than 10 minutes
      const staleJobs = await db
        .select()
        .from(jobResults)
        .where(
          and(
            eq(jobResults.jobName, "generate-item-embeddings"),
            eq(jobResults.status, "processing"),
            sql`${jobResults.createdAt} < NOW() - INTERVAL '10 minutes'`
          )
        );

      let cleanedCount = 0;

      for (const staleJob of staleJobs) {
        try {
          const result = staleJob.result as any;
          const serverId = result?.serverId;

          if (serverId) {
            // Check if there's been recent heartbeat activity
            const lastHeartbeat = result?.lastHeartbeat
              ? new Date(result.lastHeartbeat).getTime()
              : new Date(staleJob.createdAt).getTime();
            const heartbeatAge = Date.now() - lastHeartbeat;

            // Only cleanup if no recent heartbeat (older than 2 minutes)
            if (heartbeatAge > 2 * 60 * 1000) {
              const processingTime = Math.min(
                Date.now() - new Date(staleJob.createdAt).getTime(),
                3600000
              );

              await db
                .update(jobResults)
                .set({
                  status: "failed",
                  error:
                    "Job exceeded maximum processing time without heartbeat",
                  processingTime,
                  result: {
                    ...result,
                    error: "Job cleanup - exceeded maximum processing time",
                    cleanedAt: new Date().toISOString(),
                    staleDuration: heartbeatAge,
                  },
                })
                .where(eq(jobResults.id, staleJob.id));

              cleanedCount++;
              console.log(
                `[cleanup] type=stale-embedding serverId=${serverId}`
              );
            }
          }
        } catch (error) {
          console.error("Error cleaning up stale job:", staleJob.jobId, error);
        }
      }

      if (cleanedCount > 0) {
        console.log(
          `[cleanup] type=stale-embedding cleanedCount=${cleanedCount}`
        );
      }
    } catch (error) {
      console.error("Error during job cleanup:", error);
    }
  }

  /**
   * Trigger cleanup of old job results (older than 10 days)
   */
  private async triggerOldJobCleanup(): Promise<void> {
    try {
      console.log("Cleaning up job results older than 10 days...");

      const result = await db
        .delete(jobResults)
        .where(sql`${jobResults.createdAt} < NOW() - INTERVAL '10 days'`)
        .returning({ id: jobResults.id });

      const deletedCount = result.length;

      if (deletedCount > 0) {
        console.log(
          `Old job cleanup completed: deleted ${deletedCount} job results older than 10 days`
        );
      } else {
        console.log("No old job results found to clean up");
      }
    } catch (error) {
      console.error("Error during old job cleanup:", error);
    }
  }

  /**
   * Manually trigger activity sync for a specific server
   */
  async triggerServerActivitySync(
    serverId: number,
    limit: number = 100
  ): Promise<void> {
    try {
      const boss = await getJobQueue();

      await boss.send(
        JELLYFIN_JOB_NAMES.RECENT_ACTIVITIES_SYNC,
        {
          serverId,
          options: {
            activityOptions: {
              limit,
            },
          },
        },
        {
          expireInMinutes: 30, // Job expires after 30 minutes
          retryLimit: 1, // Retry once if it fails
          retryDelay: 60, // Wait 60 seconds before retrying
        }
      );

      console.log(
        `Manual activity sync queued for server ID: ${serverId} (limit: ${limit})`
      );
    } catch (error) {
      console.error(
        `Failed to queue manual activity sync for server ${serverId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Manually trigger recently added items sync for a specific server
   */
  async triggerServerRecentItemsSync(
    serverId: number,
    limit: number = 100
  ): Promise<void> {
    try {
      const boss = await getJobQueue();

      await boss.send(
        JELLYFIN_JOB_NAMES.RECENT_ITEMS_SYNC,
        {
          serverId,
          options: {
            itemOptions: {
              recentItemsLimit: limit,
            },
          },
        },
        {
          expireInMinutes: 30, // Job expires after 30 minutes
          retryLimit: 1, // Retry once if it fails
          retryDelay: 60, // Wait 60 seconds before retrying
        }
      );

      console.log(
        `Manual recently added items sync queued for server ID: ${serverId} (limit: ${limit})`
      );
    } catch (error) {
      console.error(
        `Failed to queue manual recently added items sync for server ${serverId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Manually trigger full sync for a specific server
   */
  async triggerServerFullSync(serverId: number): Promise<void> {
    try {
      const boss = await getJobQueue();

      await boss.send(
        JELLYFIN_JOB_NAMES.FULL_SYNC,
        {
          serverId,
          options: {
            // Full sync options - will sync users, libraries, items, and activities
            userOptions: {},
            libraryOptions: {},
            itemOptions: {
              // Use job-server defaults (and env overrides) to avoid hammering Jellyfin
            },
            activityOptions: {
              pageSize: 5000,
              maxPages: 1000,
              concurrency: 5,
              apiRequestDelayMs: 1000,
            },
          },
        },
        {
          expireInMinutes: 360, // Job expires after 6 hours (longer for full sync)
          retryLimit: 1, // Retry once if it fails
          retryDelay: 300, // Wait 5 minutes before retrying
        }
      );

      console.log(`Manual full sync queued for server ID: ${serverId}`);
    } catch (error) {
      console.error(
        `Failed to queue manual full sync for server ${serverId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Manually trigger user sync for a specific server
   */
  async triggerServerUserSync(serverId: number): Promise<void> {
    try {
      const boss = await getJobQueue();

      await boss.send(
        JELLYFIN_JOB_NAMES.USERS_SYNC,
        {
          serverId,
          options: {
            userOptions: {
              // User sync specific options can be added here
            },
          },
        },
        {
          expireInMinutes: 30, // Job expires after 30 minutes
          retryLimit: 1, // Retry once if it fails
          retryDelay: 60, // Wait 60 seconds before retrying
        }
      );

      console.log(`Manual user sync queued for server ID: ${serverId}`);
    } catch (error) {
      console.error(
        `Failed to queue manual user sync for server ${serverId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get current scheduler status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      activitySyncInterval: this.activitySyncInterval,
      recentItemsSyncInterval: this.recentItemsSyncInterval,
      userSyncInterval: this.userSyncInterval,
      peopleSyncInterval: this.peopleSyncInterval,
      embeddingsSyncInterval: this.embeddingsSyncInterval,
      jobCleanupInterval: this.jobCleanupInterval,
      oldJobCleanupInterval: this.oldJobCleanupInterval,
      fullSyncInterval: this.fullSyncInterval,
      runningTasks: Array.from(this.scheduledTasks.keys()),
      healthCheck: this.enabled,
    };
  }
}

// Export singleton instance
export const activityScheduler = new SyncScheduler();
