import { Container } from "@/components/Container";
import { PageTitle } from "@/components/PageTitle";
import { Skeleton } from "@/components/ui/skeleton";
import { getDefaultStartDate, setEndDateToEndOfDay } from "@/dates";
import { getDefaultEndDate } from "@/dates";
import { getServer } from "@/lib/db/server";
import {
  getMe,
  getWatchTimePerHour,
  getWatchTimePerWeekDay,
} from "@/lib/db/users";
import { showAdminStatistics } from "@/utils/adminTools";
import { Server } from "@streamystats/database/schema";
import { addDays } from "date-fns";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Graph from "../Graph";
import TotalWatchTime from "../TotalWatchTime";
import { WatchTimePerHour } from "../WatchTimePerHour";
import { WatchTimePerWeekDay } from "../WatchTimePerWeekDay";

export default async function WatchtimePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    startDate: string;
    endDate: string;
  }>;
}) {
  const { id } = await params;
  const { startDate, endDate } = await searchParams;
  const server = await getServer({ serverId: id });

  if (!server) {
    redirect("/not-found");
  }

  const _startDate = startDate || getDefaultStartDate();
  const _endDate = setEndDateToEndOfDay(endDate);

  return (
    <Container className="flex flex-col w-screen md:w-[calc(100vw-256px)]">
      <PageTitle title="Watchtime Statistics" />
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <WatchtimeStats
          server={server}
          startDate={_startDate}
          endDate={_endDate}
        />
      </Suspense>
    </Container>
  );
}

async function WatchtimeStats({
  server,
  startDate,
  endDate,
}: {
  server: Server;
  startDate: string;
  endDate: string;
}) {
  const me = await getMe();
  const sas = await showAdminStatistics();

  if (!me) {
    redirect("/not-found");
  }

  const [d1, d2] = await Promise.all([
    getWatchTimePerWeekDay({
      serverId: server.id,
      userId: sas ? undefined : me.id,
    }),
    getWatchTimePerHour({
      serverId: server.id,
      userId: sas ? undefined : me.id,
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex md:flex-row flex-col gap-2">
        <TotalWatchTime server={server} />
      </div>
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <Graph server={server} startDate={startDate} endDate={endDate} />
      </Suspense>
      <WatchTimePerWeekDay
        data={d1}
        title="Watch Time Per Day of Week"
        subtitle="Showing total watch time for each day of the week"
      />
      <WatchTimePerHour
        data={d2}
        title="Watch Time Per Hour"
        subtitle="Showing total watch time for each hour of the day"
      />
    </div>
  );
}
