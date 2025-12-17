import PgBoss from "pg-boss";
import {
  syncServerDataJob,
  addServerJob,
  generateItemEmbeddingsJob,
  geolocateActivitiesJob,
  calculateFingerprintsJob,
  backfillActivityLocationsJob,
  GEOLOCATION_JOB_NAMES,
  jellyfinFullSyncWorker,
  jellyfinUsersSyncWorker,
  jellyfinLibrariesSyncWorker,
  jellyfinItemsSyncWorker,
  jellyfinActivitiesSyncWorker,
  jellyfinRecentItemsSyncWorker,
  jellyfinRecentActivitiesSyncWorker,
  jellyfinPeopleSyncWorker,
  JELLYFIN_JOB_NAMES,
} from "./workers";

let bossInstance: PgBoss | null = null;

export async function getJobQueue(): Promise<PgBoss> {
  if (bossInstance) {
    return bossInstance;
  }

  const connectionString = Bun.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  bossInstance = new PgBoss({
    connectionString,
    retryLimit: 3,
    retryDelay: 30000, // 30 seconds
    onComplete: true,
    deleteAfterHours: 24, // Clean up completed jobs after 24 hours
    archiveCompletedAfterSeconds: 60 * 60 * 24, // Archive completed jobs after 24 hours
  });

  await bossInstance.start();
  await registerJobHandlers(bossInstance);

  return bossInstance;
}

async function registerJobHandlers(boss: PgBoss) {
  // Register media server job types
  await boss.work(
    "sync-server-data",
    { teamSize: 2, teamConcurrency: 1 }, // Limited concurrency for API rate limiting
    syncServerDataJob
  );
  await boss.work(
    "add-server",
    { teamSize: 1, teamConcurrency: 1 },
    addServerJob
  );

  // Register item embeddings job
  await boss.work(
    "generate-item-embeddings",
    { teamSize: 1, teamConcurrency: 1 }, // Limited for API rate limiting
    generateItemEmbeddingsJob
  );

  // Register Jellyfin sync workers
  await boss.work(
    JELLYFIN_JOB_NAMES.FULL_SYNC,
    { teamSize: 1, teamConcurrency: 1 }, // Limited concurrency for heavy operations
    jellyfinFullSyncWorker
  );
  await boss.work(
    JELLYFIN_JOB_NAMES.USERS_SYNC,
    { teamSize: 2, teamConcurrency: 2 },
    jellyfinUsersSyncWorker
  );
  await boss.work(
    JELLYFIN_JOB_NAMES.LIBRARIES_SYNC,
    { teamSize: 2, teamConcurrency: 2 },
    jellyfinLibrariesSyncWorker
  );
  await boss.work(
    JELLYFIN_JOB_NAMES.ITEMS_SYNC,
    { teamSize: 1, teamConcurrency: 1 }, // Limited concurrency for heavy operations
    jellyfinItemsSyncWorker
  );
  await boss.work(
    JELLYFIN_JOB_NAMES.ACTIVITIES_SYNC,
    { teamSize: 2, teamConcurrency: 2 },
    jellyfinActivitiesSyncWorker
  );
  await boss.work(
    JELLYFIN_JOB_NAMES.RECENT_ITEMS_SYNC,
    { teamSize: 3, teamConcurrency: 3 }, // Higher concurrency for lighter operations
    jellyfinRecentItemsSyncWorker
  );
  await boss.work(
    JELLYFIN_JOB_NAMES.RECENT_ACTIVITIES_SYNC,
    { teamSize: 3, teamConcurrency: 3 }, // Higher concurrency for lighter operations
    jellyfinRecentActivitiesSyncWorker
  );

  await boss.work(
    JELLYFIN_JOB_NAMES.PEOPLE_SYNC,
    { teamSize: 1, teamConcurrency: 1 },
    jellyfinPeopleSyncWorker
  );

  // Register geolocation jobs
  await boss.work(
    GEOLOCATION_JOB_NAMES.GEOLOCATE_ACTIVITIES,
    { teamSize: 2, teamConcurrency: 2 },
    geolocateActivitiesJob
  );
  await boss.work(
    GEOLOCATION_JOB_NAMES.CALCULATE_FINGERPRINTS,
    { teamSize: 1, teamConcurrency: 1 },
    calculateFingerprintsJob
  );
  await boss.work(
    GEOLOCATION_JOB_NAMES.BACKFILL_LOCATIONS,
    { teamSize: 1, teamConcurrency: 1 },
    backfillActivityLocationsJob
  );

  console.log("All job handlers registered successfully");
}

export async function closeJobQueue(): Promise<void> {
  if (bossInstance) {
    await bossInstance.stop();
    bossInstance = null;
  }
}

// Job queue utilities
export const JobTypes = {
  SYNC_SERVER_DATA: "sync-server-data",
  ADD_SERVER: "add-server",
  GENERATE_ITEM_EMBEDDINGS: "generate-item-embeddings",
} as const;
