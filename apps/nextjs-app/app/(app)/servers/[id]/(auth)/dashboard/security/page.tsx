import { Container } from "@/components/Container";
import { SecuritySyncButton } from "@/components/SecuritySyncButton";
import {
  getServerAnomalies,
  getServerLocationStats,
  getServerLocations,
} from "@/lib/db/locations";
import { getServer } from "@/lib/db/server";
import { getUsers, isUserAdmin } from "@/lib/db/users";
import { BarChart2 } from "lucide-react";
import { redirect } from "next/navigation";
import { ServerSecurityContent } from "./ServerSecurityContent";

const PAGE_SIZE = 50;

export default async function ServerSecurityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    resolved?: string;
    severity?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  }>;
}) {
  const { id } = await params;
  const { resolved, severity, userId, dateFrom, dateTo, page } =
    await searchParams;

  const [server, isAdmin] = await Promise.all([
    getServer({ serverId: id }),
    isUserAdmin(),
  ]);

  if (!server) {
    redirect("/");
  }

  if (!isAdmin) {
    redirect(`/servers/${id}/dashboard`);
  }

  const currentPage = Math.max(1, Number(page) || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const [locations, anomalyData, stats, serverUsers] = await Promise.all([
    getServerLocations(server.id, { userId, dateFrom, dateTo }),
    getServerAnomalies(server.id, {
      resolved:
        resolved === "true" ? true : resolved === "false" ? false : undefined,
      severity,
      userId,
      dateFrom,
      dateTo,
      limit: PAGE_SIZE,
      offset,
    }),
    getServerLocationStats(server.id),
    getUsers({ serverId: server.id }),
  ]);

  return (
    <Container className="flex flex-col w-screen md:w-[calc(100vw-256px)]">
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 className="w-4 h-4" />
        <h1 className="font-bold text-2xl">Security Dashboard</h1>
        <SecuritySyncButton serverId={server.id} />
      </div>
      <ServerSecurityContent
        serverId={server.id}
        locations={locations}
        anomalies={anomalyData.anomalies}
        severityBreakdown={anomalyData.severityBreakdown}
        stats={stats}
        users={serverUsers.map((u) => ({ id: u.id, name: u.name }))}
        totalAnomalies={anomalyData.total}
        currentPage={currentPage}
        pageSize={PAGE_SIZE}
      />
    </Container>
  );
}
