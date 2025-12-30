import { redirect } from "next/navigation";
import { Container } from "@/components/Container";
import { ServerJobStatusCard } from "@/components/ServerJobStatusCard";
import { getServer } from "@/lib/db/server";
import { isUserAdmin } from "@/lib/db/users";
import { LibrarySyncManager } from "../LibrarySyncManager";
import { PeopleSyncManager } from "../PeopleSyncManager";
import { SyncManager } from "../SyncManager";

export default async function JobsSettings(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const server = await getServer({ serverId: id });
  if (!server) {
    redirect("/setup");
  }

  const isAdmin = await isUserAdmin();

  return (
    <Container className="flex flex-col">
      <h1 className="text-3xl font-bold mb-8">Jobs</h1>

      <div className="space-y-8">
        {isAdmin ? <ServerJobStatusCard serverId={server.id} /> : null}
        <SyncManager serverId={server.id} serverName={server.name} />
        {isAdmin ? <PeopleSyncManager serverId={server.id} /> : null}
        {isAdmin ? <LibrarySyncManager serverId={server.id} /> : null}
      </div>
    </Container>
  );
}
