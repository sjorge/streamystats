"use client";

import {
  AlertTriangle,
  BookOpen,
  CheckCircle,
  Clock,
  Database,
  FolderOpen,
  RefreshCw,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { fetch } from "@/lib/utils";

interface SyncManagerProps {
  serverId: number;
  serverName: string;
}

const syncItems = [
  {
    icon: Users,
    title: "Users & Permissions",
    description: "Sync all user accounts and their access levels",
  },
  {
    icon: FolderOpen,
    title: "Libraries & Collections",
    description: "Update media libraries and collection metadata",
  },
  {
    icon: Database,
    title: "Media Items",
    description: "Sync all movies, shows, episodes and metadata",
  },
  {
    icon: Clock,
    title: "Playback History",
    description: "Import activities",
  },
];

export function SyncManager({ serverId }: SyncManagerProps) {
  const [isTriggering, setIsTriggering] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{
    success: boolean;
    message: string;
    timestamp: Date;
  } | null>(null);

  const handleTriggerFullSync = async () => {
    setIsTriggering(true);
    setLastSyncResult(null);

    try {
      const response = await fetch("/api/jobs/trigger-full-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ serverId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      setLastSyncResult({
        success: true,
        message: data.message || "Full sync triggered successfully",
        timestamp: new Date(),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to trigger full sync";

      setLastSyncResult({
        success: false,
        message: errorMessage,
        timestamp: new Date(),
      });
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Synchronization</CardTitle>
        <CardDescription>
          Trigger a complete sync of all data from your Jellyfin server
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ItemGroup className="rounded-lg border">
          {syncItems.map((item, index) => (
            <div key={item.title}>
              <Item size="sm">
                <ItemMedia variant="icon">
                  <item.icon className="h-4 w-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{item.title}</ItemTitle>
                  <ItemDescription>{item.description}</ItemDescription>
                </ItemContent>
              </Item>
              {index < syncItems.length - 1 && <ItemSeparator />}
            </div>
          ))}
        </ItemGroup>

        <Item variant="muted" className="rounded-lg">
          <ItemMedia variant="icon">
            <BookOpen className="h-4 w-4" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Full Sync</ItemTitle>
            <ItemDescription>
              Syncs can take several minutes depending on library size. The sync
              runs in the background.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              onClick={handleTriggerFullSync}
              disabled={isTriggering}
              size="sm"
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isTriggering ? "animate-spin" : ""}`}
              />
              {isTriggering ? "Starting..." : "Start Sync"}
            </Button>
          </ItemActions>
        </Item>

        {lastSyncResult && (
          <Alert variant={lastSyncResult.success ? "default" : "destructive"}>
            {lastSyncResult.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertDescription className="space-y-1">
              <div>{lastSyncResult.message}</div>
              <div className="text-xs opacity-75">
                {lastSyncResult.timestamp.toLocaleString()}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
