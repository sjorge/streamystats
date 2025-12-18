import { ChatDialogWrapper } from "@/components/ChatDialogWrapper";
import { DynamicBreadcrumbs } from "@/components/DynamicBreadcrumbs";
import ErrorBoundary from "@/components/ErrorBoundary";
import { SideBar } from "@/components/SideBar";
import { SuspenseLoading } from "@/components/SuspenseLoading";
import { UpdateNotifier } from "@/components/UpdateNotifier";
import { Separator } from "@/components/ui/separator";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getServer, getServers } from "@/lib/db/server";
import { getMe, isUserAdmin } from "@/lib/db/users";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type PropsWithChildren, Suspense } from "react";

interface Props extends PropsWithChildren {
  params: Promise<{ id: string }>;
}

async function SideBarContent({ serverId }: { serverId: string }) {
  const [servers, me, isAdmin] = await Promise.all([
    getServers(),
    getMe(),
    isUserAdmin(),
  ]);

  if (!me) {
    redirect(`/servers/${serverId}/login`);
  }

  return (
    <>
      <SideBar servers={servers} me={me} allowedToCreateServer={isAdmin} />
      {isAdmin && <UpdateNotifier />}
    </>
  );
}

async function HeaderContent({ serverId }: { serverId: string }) {
  const [server, me] = await Promise.all([getServer({ serverId }), getMe()]);

  const chatConfigured = !!(server?.chatProvider && server?.chatModel);

  return (
    <div className="flex flex-row items-center p-4 gap-2 relative">
      <SidebarTrigger />
      <Separator orientation="vertical" />
      <DynamicBreadcrumbs />
      <div className="ml-auto">
        <ChatDialogWrapper
          chatConfigured={chatConfigured}
          me={me ?? undefined}
          serverUrl={server?.url}
        />
      </div>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-row items-center p-4 gap-2 relative">
      <Skeleton className="h-8 w-8" />
      <Separator orientation="vertical" />
      <Skeleton className="h-4 w-48" />
      <div className="ml-auto">
        <Skeleton className="h-8 w-8" />
      </div>
    </div>
  );
}

function SideBarSkeleton() {
  return <Skeleton className="h-full w-64" />;
}

export default async function layout({ children, params }: Props) {
  const { id } = await params;
  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get("sidebar_state")?.value;
  const defaultSidebarOpen = sidebarCookie ? sidebarCookie === "true" : true;

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <Suspense fallback={<SideBarSkeleton />}>
        <SideBarContent serverId={id} />
      </Suspense>
      <ErrorBoundary>
        <main>
          <Suspense fallback={<HeaderSkeleton />}>
            <HeaderContent serverId={id} />
          </Suspense>
          <Suspense fallback={<SuspenseLoading />}>{children}</Suspense>
        </main>
      </ErrorBoundary>
    </SidebarProvider>
  );
}
