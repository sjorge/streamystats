import type { Server } from "@streamystats/database";
import type { JSX } from "react";
import { getWatchTimePerType } from "@/lib/db/statistics";
import { getMe } from "@/lib/db/users";
import { showAdminStatistics } from "@/utils/adminTools";
import { WatchTimeGraph } from "./WatchTimeGraph";

interface Props {
  server: Server;
  startDate: string;
  endDate: string;
}

export async function Graph({
  server,
  startDate,
  endDate,
}: Props): Promise<JSX.Element> {
  const showAdminStats = await showAdminStatistics();
  const me = await getMe();
  const data = await getWatchTimePerType({
    serverId: server.id,
    startDate,
    endDate,
    userId: showAdminStats ? undefined : me?.id,
  });

  if (!data) {
    return <p>No data available</p>;
  }

  return <WatchTimeGraph data={data} startDate={startDate} endDate={endDate} />;
}
export default Graph;
