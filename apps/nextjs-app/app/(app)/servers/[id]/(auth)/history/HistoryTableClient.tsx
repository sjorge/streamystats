"use client";

import dynamic from "next/dynamic";
import type { HistoryResponse } from "@/lib/db/history";
import type { Server } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

const HistoryTable = dynamic(
  () => import("./HistoryTable").then((mod) => mod.HistoryTable),
  {
    ssr: false,
    loading: () => (
      <div className="w-full space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32 ml-auto" />
        </div>
        <Skeleton className="h-[400px] w-full" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
    ),
  }
);

interface Props {
  data: HistoryResponse;
  server: Server;
  hideUserColumn?: boolean;
}

export function HistoryTableClient({ data, server, hideUserColumn }: Props) {
  return (
    <HistoryTable data={data} server={server} hideUserColumn={hideUserColumn} />
  );
}
