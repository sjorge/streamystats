"use server";

import { ChatDialogWrapper } from "@/components/ChatDialogWrapper";
import { DynamicBreadcrumbs } from "@/components/DynamicBreadcrumbs";
import ErrorBoundary from "@/components/ErrorBoundary";
import { SideBarClient } from "@/components/SideBarClient";
import { SuspenseLoading } from "@/components/SuspenseLoading";
import { UpdateNotifier } from "@/components/UpdateNotifier";
import { Separator } from "@/components/ui/separator";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getServer, getServers } from "@/lib/db/server";
import { getMe, isUserAdmin } from "@/lib/db/users";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PropsWithChildren, Suspense } from "react";

interface Props extends PropsWithChildren {
  params: Promise<{ id: string }>;
}

export default async function layout({ children, params }: Props) {
  const { id } = await params;

  const [servers, server, me, isAdmin] = await Promise.all([
    getServers(),
    getServer({ serverId: id }),
    getMe(),
    isUserAdmin(),
  ]);

  if (!me) {
    redirect(`/servers/${id}/login`);
  }

  const chatConfigured = !!(server?.chatProvider && server?.chatModel);
  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get("sidebar_state")?.value;
  const defaultSidebarOpen = sidebarCookie ? sidebarCookie === "true" : true;

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <SideBarClient
        servers={servers}
        me={me}
        allowedToCreateServer={isAdmin}
      />
      <Suspense fallback={<SuspenseLoading />}>
        <ErrorBoundary>
          <main>
            <div className="flex flex-row items-center p-4 gap-2 relative">
              <SidebarTrigger />
              <Separator orientation="vertical" />
              <DynamicBreadcrumbs />
              <div className="ml-auto">
                <ChatDialogWrapper
                  chatConfigured={chatConfigured}
                  me={me}
                  serverUrl={server?.url}
                />
              </div>
            </div>
            {children}
          </main>
        </ErrorBoundary>
      </Suspense>
      {isAdmin ? (
        <>
          <UpdateNotifier />
        </>
      ) : null}
    </SidebarProvider>
  );
}
