import { db, servers } from "@streamystats/database";
import { sql } from "drizzle-orm";
import { getJobQueue } from "../../jobs/queue";

export function toIsoUtcMicros(date: Date): string {
  return date.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

export async function cancelJobsByName(
  jobName: string,
  serverId?: number
): Promise<number> {
  try {
    const boss = await getJobQueue();

    const serverFilter =
      typeof serverId === "number"
        ? sql`and (data->>'serverId')::int = ${serverId}`
        : sql``;

    const rows = (await db.execute(
      sql`
        select id
        from pgboss.job
        where
          name = ${jobName}
          and state < 'completed'
          ${serverFilter}
      `
    )) as unknown as Array<{ id: string }>;

    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      return 0;
    }

    await boss.cancel(ids);
    return ids.length;
  } catch (error) {
    console.error(`Error stopping jobs of type "${jobName}":`, error);
    throw new Error(`Failed to stop jobs of type "${jobName}": ${error}`);
  }
}

