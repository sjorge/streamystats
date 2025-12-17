import { Container } from "@/components/Container";
import { PageTitle } from "@/components/PageTitle";
import {
  getServerAnomalies,
  getServerLocationStats,
  getServerLocations,
} from "@/lib/db/locations";
import { getServer } from "@/lib/db/server";
import { getUsers } from "@/lib/db/users";
import { redirect } from "next/navigation";
import { ServerSecurityContent } from "./ServerSecurityContent";

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
  }>;
}) {
  const { id } = await params;
  const { resolved, severity, userId, dateFrom, dateTo } = await searchParams;

  const server = await getServer({ serverId: id });

  if (!server) {
    redirect("/");
  }

  const [locations, anomalyData, stats, serverUsers] = await Promise.all([
    getServerLocations(server.id, { userId, dateFrom, dateTo }),
    getServerAnomalies(server.id, {
      resolved:
        resolved === "true" ? true : resolved === "false" ? false : undefined,
      severity,
      userId,
      dateFrom,
      dateTo,
    }),
    getServerLocationStats(server.id),
    getUsers({ serverId: server.id }),
  ]);

  return (
    <Container className="flex flex-col w-screen md:w-[calc(100vw-256px)]">
      <PageTitle title="Security Dashboard" />
      <ServerSecurityContent
        serverId={server.id}
        locations={locations}
        anomalies={anomalyData.anomalies}
        severityBreakdown={anomalyData.severityBreakdown}
        stats={stats}
        users={serverUsers.map((u) => ({ id: u.id, name: u.name }))}
      />
    </Container>
  );
}

