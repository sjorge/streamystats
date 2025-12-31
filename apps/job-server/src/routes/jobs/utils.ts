import { getJobQueue } from "../../jobs/queue";
import { db, servers } from "@streamystats/database";
import { eq } from "drizzle-orm";

export async function getServerById(
  serverId: string | number
): Promise<{ id: number; name: string } | null> {
  const numericId =
    typeof serverId === "string" ? Number.parseInt(serverId, 10) : serverId;

  if (!Number.isFinite(numericId)) {
    return null;
  }

  const result = await db
    .select({ id: servers.id, name: servers.name })
    .from(servers)
    .where(eq(servers.id, numericId))
    .limit(1);

  return result[0] ?? null;
}

export function toIsoUtcMicros(date: Date): string {
  return date.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

export async function cancelJobsByName(
  jobName: string,
  serverId?: number
): Promise<number> {
  try {
    const boss = await getJobQueue();

    const jobs = await boss.fetch(jobName, { batchSize: 100 });

    if (!jobs || jobs.length === 0) {
      return 0;
    }

    // Filter by serverId if provided
    const jobsToCancel = serverId
      ? jobs.filter((j) => {
          const data = j.data as { serverId?: number };
          return data?.serverId === serverId;
        })
      : jobs;

    if (jobsToCancel.length === 0) {
      return 0;
    }

    const ids = jobsToCancel.map((j) => j.id);

    await boss.cancel(jobName, ids);
    return ids.length;
  } catch (error) {
    console.error(`Error stopping jobs of type "${jobName}":`, error);
    throw new Error(`Failed to stop jobs of type "${jobName}": ${error}`);
  }
}

