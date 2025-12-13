"use client";

import dynamic from "next/dynamic";
import type { Server } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

const DeleteServer = dynamic(
  () => import("./DeleteServer").then((mod) => mod.DeleteServer),
  {
    ssr: false,
    loading: () => (
      <div className="border p-4 rounded-lg flex flex-col gap-4 items-start">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-32" />
      </div>
    ),
  }
);

interface Props {
  server: Server;
}

export function DeleteServerClient({ server }: Props) {
  return <DeleteServer server={server} />;
}
