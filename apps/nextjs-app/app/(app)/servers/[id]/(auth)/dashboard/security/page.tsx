import { Container } from "@/components/Container";
import { PageTitle } from "@/components/PageTitle";
import {
  getServerAnomalies,
  getServerLocationStats,
  getServerLocations,
} from "@/lib/db/locations";
import { getServer } from "@/lib/db/server";
import { redirect } from "next/navigation";
import { ServerSecurityContent } from "./ServerSecurityContent";

export default async function ServerSecurityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ resolved?: string; severity?: string }>;
}) {
  const { id } = await params;
  const { resolved, severity } = await searchParams;

  const server = await getServer({ serverId: id });

  if (!server) {
    redirect("/");
  }

  const [locations, anomalyData, stats] = await Promise.all([
    getServerLocations(server.id),
    getServerAnomalies(server.id, {
      resolved:
        resolved === "true" ? true : resolved === "false" ? false : undefined,
      severity,
    }),
    getServerLocationStats(server.id),
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
      />
    </Container>
  );
}

