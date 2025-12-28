import { redirect } from "next/navigation";
import { getServers } from "@/lib/db/server";

export default async function Home() {
  let servers: Awaited<ReturnType<typeof getServers>> = [];

  try {
    servers = await getServers();
  } catch (error) {
    console.error("[DEBUG] Home page: Error fetching servers:", error);
    redirect("/setup");
  }

  const firstServerId = servers[0]?.id;
  if (firstServerId) {
    redirect(`/servers/${firstServerId}/dashboard`);
  }

  redirect("/setup");
}
