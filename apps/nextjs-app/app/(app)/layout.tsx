"use client";

import { VersionBadge } from "@/components/VersionBadge";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

type Props = PropsWithChildren;

const queryClient = new QueryClient();

export default function layout({ children }: Props) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <VersionBadge />
    </QueryClientProvider>
  );
}
