import { redirect } from "next/navigation";
import { getServers } from "@/lib/db/server";

export default async function Home() {
  try {
    const servers = await getServers();
    const firstServerId = servers[0]?.id;
    if (firstServerId) {
      redirect(`/servers/${firstServerId}/dashboard`);
    }
  } catch (error) {
    console.error("[DEBUG] Home page: Error fetching servers:", error);
    redirect("/setup");
  }

  redirect("/setup");
}
