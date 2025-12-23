"use server";

import { Clock, Database, FileUp } from "lucide-react";
import { redirect } from "next/navigation";
import { Container } from "@/components/Container";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { getServer } from "@/lib/db/server";
import DatabaseBackupRestore from "./DatabaseBackupRestore";
import JellystatsImport from "./JellystatsImport";
import PlaybackReportingImport from "./PlaybackReportingImport";

export default async function BackupAndImportSettings(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const server = await getServer({ serverId: id });

  if (!server) {
    redirect("/not-found");
  }

  const hasCompletedInitialSync = server.lastSyncCompleted !== null;

  return (
    <Container className="flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Backup & Import Settings</h1>
        <p className="text-muted-foreground">
          Import playback history from other sources or backup and restore your
          Streamystats data.
        </p>
      </div>

      {!hasCompletedInitialSync && (
        <Alert
          variant="default"
          className="mb-8 border-amber-500/50 bg-amber-500/10"
        >
          <Clock className="h-4 w-4 text-amber-500" />
          <AlertTitle className="text-amber-600 dark:text-amber-400">
            Initial Sync Required
          </AlertTitle>
          <AlertDescription className="text-amber-600/80 dark:text-amber-400/80">
            Please wait for the initial server sync to complete before importing
            data. This ensures users and items are available for matching
            imported sessions. Import functionality is disabled until the sync
            completes.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-10">
        {/* Import from External Sources Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Import from External Sources</h2>
              <p className="text-sm text-muted-foreground">
                Import playback history from Jellystats or Playback Reporting
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <JellystatsImport
              serverId={server.id}
              lastSyncCompleted={server.lastSyncCompleted}
            />
            <PlaybackReportingImport
              serverId={server.id}
              lastSyncCompleted={server.lastSyncCompleted}
            />
          </div>
        </section>

        <Separator className="my-8" />

        {/* Backup & Restore Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Backup & Restore</h2>
              <p className="text-sm text-muted-foreground">
                Export or restore your Streamystats database
              </p>
            </div>
          </div>

          <DatabaseBackupRestore
            serverId={server.id}
            lastSyncCompleted={server.lastSyncCompleted}
          />
        </section>
      </div>
    </Container>
  );
}
