import { Container } from "@/components/Container";
import { PageTitle } from "@/components/PageTitle";
import { Skeleton } from "@/components/ui/skeleton";
import { getClientStatistics } from "@/lib/db/client-statistics";
import { getServer } from "@/lib/db/server";
import { getMe } from "@/lib/db/users";
import { showAdminStatistics } from "@/utils/adminTools";
import type { Server } from "@streamystats/database";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ClientStatistics } from "../ClientStatistics";

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
  }>;
}) {
  const { id } = await params;
  const { startDate, endDate } = await searchParams;
  const server = await getServer({ serverId: id });

  if (!server) {
    redirect("/not-found");
  }

  return (
    <Container className="flex flex-col w-screen md:w-[calc(100vw-256px)]">
      <PageTitle title="Client Statistics" />
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <ClientStats server={server} startDate={startDate} endDate={endDate} />
      </Suspense>
    </Container>
  );
}

async function ClientStats({
  server,
  startDate,
  endDate,
}: {
  server: Server;
  startDate?: string;
  endDate?: string;
}) {
  const sas = await showAdminStatistics();
  const me = await getMe();
  const stats = await getClientStatistics(
    server.id,
    startDate,
    endDate,
    sas ? undefined : me?.id,
  );

  return (
    <div className="flex flex-col gap-6">
      <ClientStatistics data={stats} />
    </div>
  );
}
