"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activityScheduler = void 0;
const cron = __importStar(require("node-cron"));
const database_1 = require("@streamystats/database");
const drizzle_orm_1 = require("drizzle-orm");
const queue_1 = require("./queue");
const workers_1 = require("../jellyfin/workers");
class SyncScheduler {
    scheduledTasks = new Map();
    enabled = false;
    activitySyncInterval = "*/5 * * * *"; // Every 5 minutes
    recentItemsSyncInterval = "*/5 * * * *"; // Every 5 minutes
    userSyncInterval = "*/5 * * * *"; // Every 5 minutes
    jobCleanupInterval = "*/5 * * * *"; // Every 5 minutes
    oldJobCleanupInterval = "0 3 * * *"; // Daily at 3 AM
    fullSyncInterval = "0 2 * * *"; // Daily at 2 AM
    constructor() {
        // Auto-start if not explicitly disabled
        const autoStart = process.env.SCHEDULER_AUTO_START !== "false";
        if (autoStart) {
            this.start();
        }
    }
    /**
     * Start the scheduler with current configuration
     */
    start() {
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
            const recentItemsTask = cron.schedule(this.recentItemsSyncInterval, () => {
                this.triggerRecentItemsSync().catch((error) => {
                    console.error("Error during scheduled recent items sync:", error);
                });
            });
            // User sync task
            const userSyncTask = cron.schedule(this.userSyncInterval, () => {
                this.triggerUserSync().catch((error) => {
                    console.error("Error during scheduled user sync:", error);
                });
            });
            // Job cleanup task for stale embedding jobs
            const jobCleanupTask = cron.schedule(this.jobCleanupInterval, () => {
                this.triggerJobCleanup().catch((error) => {
                    console.error("Error during scheduled job cleanup:", error);
                });
            });
            // Old job cleanup task - removes job results older than 10 days
            const oldJobCleanupTask = cron.schedule(this.oldJobCleanupInterval, () => {
                this.triggerOldJobCleanup().catch((error) => {
                    console.error("Error during scheduled old job cleanup:", error);
                });
            });
            // Full sync task - daily complete sync
            const fullSyncTask = cron.schedule(this.fullSyncInterval, () => {
                this.triggerFullSync().catch((error) => {
                    console.error("Error during scheduled full sync:", error);
                });
            });
            this.scheduledTasks.set("activity-sync", activityTask);
            this.scheduledTasks.set("recent-items-sync", recentItemsTask);
            this.scheduledTasks.set("user-sync", userSyncTask);
            this.scheduledTasks.set("job-cleanup", jobCleanupTask);
            this.scheduledTasks.set("old-job-cleanup", oldJobCleanupTask);
            this.scheduledTasks.set("full-sync", fullSyncTask);
            // Start all tasks
            activityTask.start();
            recentItemsTask.start();
            userSyncTask.start();
            jobCleanupTask.start();
            oldJobCleanupTask.start();
            fullSyncTask.start();
            console.log("Scheduler started successfully");
            console.log(`Activity sync: ${this.activitySyncInterval}`);
            console.log(`Recent items sync: ${this.recentItemsSyncInterval}`);
            console.log(`User sync: ${this.userSyncInterval}`);
            console.log(`Job cleanup: ${this.jobCleanupInterval}`);
            console.log(`Old job cleanup: ${this.oldJobCleanupInterval}`);
            console.log(`Full sync: ${this.fullSyncInterval}`);
        }
        catch (error) {
            console.error("Failed to start scheduler:", error);
            this.enabled = false;
            throw error;
        }
    }
    /**
     * Stop the scheduler
     */
    stop() {
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
            }
            catch (error) {
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
    updateConfig(config) {
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
            }
            else {
                this.stop();
            }
        }
        else if (wasEnabled && this.enabled) {
            // Restart with new configuration if it was running
            this.stop();
            this.start();
        }
    }
    /**
     * Trigger activity sync for all active servers
     */
    async triggerActivitySync() {
        try {
            console.log("Triggering periodic activity sync...");
            // Get all servers that are not currently syncing
            const activeServers = await database_1.db
                .select()
                .from(database_1.servers)
                .where((0, drizzle_orm_1.ne)(database_1.servers.syncStatus, "syncing"));
            if (activeServers.length === 0) {
                console.log("No active servers found for activity sync");
                return;
            }
            const boss = await (0, queue_1.getJobQueue)();
            // Queue activity sync jobs for each server
            for (const server of activeServers) {
                try {
                    await boss.send(workers_1.JELLYFIN_JOB_NAMES.RECENT_ACTIVITIES_SYNC, {
                        serverId: server.id,
                        options: {
                            activityOptions: {
                                limit: 100, // Default limit
                            },
                        },
                    }, {
                        expireInMinutes: 30, // Job expires after 30 minutes
                        retryLimit: 1, // Retry once if it fails
                        retryDelay: 60, // Wait 60 seconds before retrying
                    });
                    console.log(`Queued periodic activity sync for server: ${server.name} (ID: ${server.id})`);
                }
                catch (error) {
                    console.error(`Failed to queue activity sync for server ${server.name}:`, error);
                }
            }
            console.log(`Periodic activity sync queued for ${activeServers.length} servers`);
        }
        catch (error) {
            console.error("Error during periodic activity sync trigger:", error);
        }
    }
    /**
     * Trigger recently added items sync for all active servers
     */
    async triggerRecentItemsSync() {
        try {
            console.log("Triggering periodic recently added items sync...");
            // Get all servers that are not currently syncing
            const activeServers = await database_1.db
                .select()
                .from(database_1.servers)
                .where((0, drizzle_orm_1.ne)(database_1.servers.syncStatus, "syncing"));
            if (activeServers.length === 0) {
                console.log("No active servers found for recently added items sync");
                return;
            }
            const boss = await (0, queue_1.getJobQueue)();
            // Queue recently added items sync jobs for each server
            for (const server of activeServers) {
                try {
                    await boss.send(workers_1.JELLYFIN_JOB_NAMES.RECENT_ITEMS_SYNC, {
                        serverId: server.id,
                        options: {
                            itemOptions: {
                                recentItemsLimit: 100, // Default limit
                            },
                        },
                    }, {
                        expireInMinutes: 30, // Job expires after 30 minutes
                        retryLimit: 1, // Retry once if it fails
                        retryDelay: 60, // Wait 60 seconds before retrying
                    });
                    console.log(`Queued periodic recently added items sync for server: ${server.name} (ID: ${server.id})`);
                }
                catch (error) {
                    console.error(`Failed to queue recently added items sync for server ${server.name}:`, error);
                }
            }
            console.log(`Periodic recently added items sync queued for ${activeServers.length} servers`);
        }
        catch (error) {
            console.error("Error during periodic recently added items sync trigger:", error);
        }
    }
    /**
     * Trigger user sync for all active servers
     */
    async triggerUserSync() {
        try {
            console.log("Triggering periodic user sync...");
            // Get all servers that are not currently syncing
            const activeServers = await database_1.db
                .select()
                .from(database_1.servers)
                .where((0, drizzle_orm_1.ne)(database_1.servers.syncStatus, "syncing"));
            if (activeServers.length === 0) {
                console.log("No active servers found for user sync");
                return;
            }
            const boss = await (0, queue_1.getJobQueue)();
            // Queue user sync jobs for each server
            for (const server of activeServers) {
                try {
                    await boss.send(workers_1.JELLYFIN_JOB_NAMES.USERS_SYNC, {
                        serverId: server.id,
                        options: {
                            userOptions: {
                            // User sync specific options can be added here
                            },
                        },
                    }, {
                        expireInMinutes: 30, // Job expires after 30 minutes
                        retryLimit: 1, // Retry once if it fails
                        retryDelay: 60, // Wait 60 seconds before retrying
                    });
                    console.log(`Queued periodic user sync for server: ${server.name} (ID: ${server.id})`);
                }
                catch (error) {
                    console.error(`Failed to queue user sync for server ${server.name}:`, error);
                }
            }
            console.log(`Periodic user sync queued for ${activeServers.length} servers`);
        }
        catch (error) {
            console.error("Error during periodic user sync trigger:", error);
        }
    }
    /**
     * Trigger full sync for all active servers
     */
    async triggerFullSync() {
        try {
            console.log("Triggering scheduled daily full sync...");
            // Get all servers that are not currently syncing
            const activeServers = await database_1.db
                .select()
                .from(database_1.servers)
                .where((0, drizzle_orm_1.ne)(database_1.servers.syncStatus, "syncing"));
            if (activeServers.length === 0) {
                console.log("No active servers found for full sync");
                return;
            }
            const boss = await (0, queue_1.getJobQueue)();
            // Queue full sync jobs for each server
            for (const server of activeServers) {
                try {
                    await boss.send(workers_1.JELLYFIN_JOB_NAMES.FULL_SYNC, {
                        serverId: server.id,
                        options: {
                            // Full sync options - will sync users, libraries, items, and activities
                            userOptions: {},
                            libraryOptions: {},
                            itemOptions: {
                                itemPageSize: 500,
                                batchSize: 1000,
                                maxLibraryConcurrency: 2,
                                itemConcurrency: 10,
                                apiRequestDelayMs: 100,
                            },
                            activityOptions: {
                                pageSize: 100,
                                maxPages: 1000,
                                concurrency: 5,
                                apiRequestDelayMs: 100,
                            },
                        },
                    }, {
                        expireInMinutes: 360, // Job expires after 6 hours (longer for full sync)
                        retryLimit: 1, // Retry once if it fails
                        retryDelay: 300, // Wait 5 minutes before retrying
                    });
                    console.log(`Queued scheduled full sync for server: ${server.name} (ID: ${server.id})`);
                }
                catch (error) {
                    console.error(`Failed to queue full sync for server ${server.name}:`, error);
                }
            }
            console.log(`Scheduled daily full sync queued for ${activeServers.length} servers`);
        }
        catch (error) {
            console.error("Error during scheduled full sync trigger:", error);
        }
    }
    /**
     * Trigger cleanup of stale embedding jobs
     */
    async triggerJobCleanup() {
        try {
            // Find all processing embedding jobs older than 10 minutes
            const staleJobs = await database_1.db
                .select()
                .from(database_1.jobResults)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(database_1.jobResults.jobName, "generate-item-embeddings"), (0, drizzle_orm_1.eq)(database_1.jobResults.status, "processing"), (0, drizzle_orm_1.sql) `${database_1.jobResults.createdAt} < NOW() - INTERVAL '10 minutes'`));
            let cleanedCount = 0;
            for (const staleJob of staleJobs) {
                try {
                    const result = staleJob.result;
                    const serverId = result?.serverId;
                    if (serverId) {
                        // Check if there's been recent heartbeat activity
                        const lastHeartbeat = result?.lastHeartbeat
                            ? new Date(result.lastHeartbeat).getTime()
                            : new Date(staleJob.createdAt).getTime();
                        const heartbeatAge = Date.now() - lastHeartbeat;
                        // Only cleanup if no recent heartbeat (older than 2 minutes)
                        if (heartbeatAge > 2 * 60 * 1000) {
                            const processingTime = Math.min(Date.now() - new Date(staleJob.createdAt).getTime(), 3600000);
                            await database_1.db
                                .update(database_1.jobResults)
                                .set({
                                status: "failed",
                                error: "Job exceeded maximum processing time without heartbeat",
                                processingTime,
                                result: {
                                    ...result,
                                    error: "Job cleanup - exceeded maximum processing time",
                                    cleanedAt: new Date().toISOString(),
                                    staleDuration: heartbeatAge,
                                },
                            })
                                .where((0, drizzle_orm_1.eq)(database_1.jobResults.id, staleJob.id));
                            cleanedCount++;
                            console.log(`Cleaned up stale embedding job for server ${serverId}`);
                        }
                    }
                }
                catch (error) {
                    console.error("Error cleaning up stale job:", staleJob.jobId, error);
                }
            }
            if (cleanedCount > 0) {
                console.log(`Job cleanup completed: cleaned ${cleanedCount} stale embedding jobs`);
            }
        }
        catch (error) {
            console.error("Error during job cleanup:", error);
        }
    }
    /**
     * Trigger cleanup of old job results (older than 10 days)
     */
    async triggerOldJobCleanup() {
        try {
            console.log("Cleaning up job results older than 10 days...");
            const result = await database_1.db
                .delete(database_1.jobResults)
                .where((0, drizzle_orm_1.sql) `${database_1.jobResults.createdAt} < NOW() - INTERVAL '10 days'`)
                .returning({ id: database_1.jobResults.id });
            const deletedCount = result.length;
            if (deletedCount > 0) {
                console.log(`Old job cleanup completed: deleted ${deletedCount} job results older than 10 days`);
            }
            else {
                console.log("No old job results found to clean up");
            }
        }
        catch (error) {
            console.error("Error during old job cleanup:", error);
        }
    }
    /**
     * Manually trigger activity sync for a specific server
     */
    async triggerServerActivitySync(serverId, limit = 100) {
        try {
            const boss = await (0, queue_1.getJobQueue)();
            await boss.send(workers_1.JELLYFIN_JOB_NAMES.RECENT_ACTIVITIES_SYNC, {
                serverId,
                options: {
                    activityOptions: {
                        limit,
                    },
                },
            }, {
                expireInMinutes: 30, // Job expires after 30 minutes
                retryLimit: 1, // Retry once if it fails
                retryDelay: 60, // Wait 60 seconds before retrying
            });
            console.log(`Manual activity sync queued for server ID: ${serverId} (limit: ${limit})`);
        }
        catch (error) {
            console.error(`Failed to queue manual activity sync for server ${serverId}:`, error);
            throw error;
        }
    }
    /**
     * Manually trigger recently added items sync for a specific server
     */
    async triggerServerRecentItemsSync(serverId, limit = 100) {
        try {
            const boss = await (0, queue_1.getJobQueue)();
            await boss.send(workers_1.JELLYFIN_JOB_NAMES.RECENT_ITEMS_SYNC, {
                serverId,
                options: {
                    itemOptions: {
                        recentItemsLimit: limit,
                    },
                },
            }, {
                expireInMinutes: 30, // Job expires after 30 minutes
                retryLimit: 1, // Retry once if it fails
                retryDelay: 60, // Wait 60 seconds before retrying
            });
            console.log(`Manual recently added items sync queued for server ID: ${serverId} (limit: ${limit})`);
        }
        catch (error) {
            console.error(`Failed to queue manual recently added items sync for server ${serverId}:`, error);
            throw error;
        }
    }
    /**
     * Manually trigger full sync for a specific server
     */
    async triggerServerFullSync(serverId) {
        try {
            const boss = await (0, queue_1.getJobQueue)();
            await boss.send(workers_1.JELLYFIN_JOB_NAMES.FULL_SYNC, {
                serverId,
                options: {
                    // Full sync options - will sync users, libraries, items, and activities
                    userOptions: {},
                    libraryOptions: {},
                    itemOptions: {
                        itemPageSize: 500,
                        batchSize: 1000,
                        maxLibraryConcurrency: 2,
                        itemConcurrency: 10,
                        apiRequestDelayMs: 100,
                    },
                    activityOptions: {
                        pageSize: 100,
                        maxPages: 1000,
                        concurrency: 5,
                        apiRequestDelayMs: 100,
                    },
                },
            }, {
                expireInMinutes: 360, // Job expires after 6 hours (longer for full sync)
                retryLimit: 1, // Retry once if it fails
                retryDelay: 300, // Wait 5 minutes before retrying
            });
            console.log(`Manual full sync queued for server ID: ${serverId}`);
        }
        catch (error) {
            console.error(`Failed to queue manual full sync for server ${serverId}:`, error);
            throw error;
        }
    }
    /**
     * Manually trigger user sync for a specific server
     */
    async triggerServerUserSync(serverId) {
        try {
            const boss = await (0, queue_1.getJobQueue)();
            await boss.send(workers_1.JELLYFIN_JOB_NAMES.USERS_SYNC, {
                serverId,
                options: {
                    userOptions: {
                    // User sync specific options can be added here
                    },
                },
            }, {
                expireInMinutes: 30, // Job expires after 30 minutes
                retryLimit: 1, // Retry once if it fails
                retryDelay: 60, // Wait 60 seconds before retrying
            });
            console.log(`Manual user sync queued for server ID: ${serverId}`);
        }
        catch (error) {
            console.error(`Failed to queue manual user sync for server ${serverId}:`, error);
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
            jobCleanupInterval: this.jobCleanupInterval,
            oldJobCleanupInterval: this.oldJobCleanupInterval,
            fullSyncInterval: this.fullSyncInterval,
            runningTasks: Array.from(this.scheduledTasks.keys()),
            healthCheck: this.enabled,
        };
    }
}
// Export singleton instance
exports.activityScheduler = new SyncScheduler();
