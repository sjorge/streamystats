import { redirect } from "next/navigation";
import { Container } from "@/components/Container";
import { getActorDetails } from "@/lib/db/actors";
import { getServer } from "@/lib/db/server";
import { ActorHeader } from "./ActorHeader";
import { ActorFilmography } from "./ActorFilmography";

export default async function ActorPage({
  params,
}: {
  params: Promise<{ id: string; actorId: string }>;
}) {
  const { id, actorId } = await params;

  const server = await getServer({ serverId: id });
  if (!server) {
    redirect("/not-found");
  }

  const actorDetails = await getActorDetails({
    serverId: server.id,
    actorId: decodeURIComponent(actorId),
  });

  if (!actorDetails) {
    redirect("/not-found");
  }

  return (
    <Container className="flex flex-col">
      <div className="space-y-6 pb-10">
        <ActorHeader actor={actorDetails} server={server} />
        <ActorFilmography
          items={actorDetails.items}
          server={server}
          serverId={server.id}
        />
      </div>
    </Container>
  );
}

