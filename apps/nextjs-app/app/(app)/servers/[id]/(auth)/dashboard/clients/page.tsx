import type { Server } from "@streamystats/database";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Container } from "@/components/Container";
import { PageTitle } from "@/components/PageTitle";
import { Skeleton } from "@/components/ui/skeleton";
import { setEndDateToEndOfDay } from "@/dates";
import { getClientStatistics } from "@/lib/db/client-statistics";
import { getServer } from "@/lib/db/server";
import { getMe, getUsers } from "@/lib/db/users";
import { showAdminStatistics } from "@/utils/adminTools";
import { ClientStatistics } from "../ClientStatistics";
import { ClientFilters } from "./ClientFilters";

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    userId?: string;
  }>;
}) {
  const { id } = await params;
  const { startDate, endDate, userId } = await searchParams;
  const server = await getServer({ serverId: id });

  if (!server) {
    redirect("/not-found");
  }

  // No dates = all time (no redirect needed)
  const effectiveEndDate = endDate ? setEndDateToEndOfDay(endDate) : undefined;

  const sas = await showAdminStatistics();
  const users = await getUsers({ serverId: server.id });

  return (
    <Container className="flex flex-col">
      <PageTitle title="Client Statistics" />
      <ClientFilters
        users={users.map((u) => ({ id: u.id, name: u.name }))}
        showUserFilter={sas}
      />
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <ClientStats
          server={server}
          startDate={startDate}
          endDate={effectiveEndDate}
          userId={userId}
        />
      </Suspense>
    </Container>
  );
}

async function ClientStats({
  server,
  startDate,
  endDate,
  userId,
}: {
  server: Server;
  startDate?: string;
  endDate?: string;
  userId?: string;
}) {
  const sas = await showAdminStatistics();
  const me = await getMe();

  // Determine which userId to use:
  // 1. If userId is provided in query params, use it
  // 2. If user doesn't have admin stats, use their own ID
  // 3. Otherwise, undefined (all users)
  const effectiveUserId = userId ? userId : sas ? undefined : me?.id;

  const stats = await getClientStatistics(
    server.id,
    startDate,
    endDate,
    effectiveUserId,
  );

  return (
    <div className="flex flex-col gap-6">
      <ClientStatistics data={stats} />
    </div>
  );
}
