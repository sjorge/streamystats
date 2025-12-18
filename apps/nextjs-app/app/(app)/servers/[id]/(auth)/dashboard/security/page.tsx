import { redirect } from "next/navigation";

export default async function SecurityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/servers/${id}/dashboard/security/map`);
}
