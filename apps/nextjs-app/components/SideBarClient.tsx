"use client";

import dynamic from "next/dynamic";
import type { Server, User } from "@streamystats/database";
import { Skeleton } from "./ui/skeleton";

const SideBar = dynamic(() => import("./SideBar").then((mod) => mod.SideBar), {
  ssr: false,
  loading: () => <SideBarSkeleton />,
});

function SideBarSkeleton() {
  return (
    <div className="hidden md:flex h-svh w-64 flex-col bg-sidebar p-2 gap-4">
      <Skeleton className="h-12 w-full rounded-md" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-16 rounded" />
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-16 rounded" />
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
      </div>
      <div className="mt-auto">
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
    </div>
  );
}

interface Props {
  servers: Server[];
  me?: User;
  allowedToCreateServer?: boolean;
}

export function SideBarClient(props: Props) {
  return <SideBar {...props} />;
}
