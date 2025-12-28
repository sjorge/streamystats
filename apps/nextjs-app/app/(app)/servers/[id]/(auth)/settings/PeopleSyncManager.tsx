"use client";

import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { fetch } from "@/lib/utils";

interface PeopleSyncManagerProps {
  serverId: number;
}

interface PeopleSyncProgress {
  success: boolean;
  total: number;
  synced: number;
  remaining: number;
  progress: number;
  isComplete: boolean;
}

export function PeopleSyncManager({ serverId }: PeopleSyncManagerProps) {
  const [data, setData] = useState<PeopleSyncProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<{
    success: boolean;
    message: string;
    timestamp: Date;
  } | null>(null);

  const fetchProgress = async () => {
    try {
      const response = await fetch(
        `/api/jobs/servers/${serverId}/people-sync-progress`,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch progress");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTriggerSync = async () => {
    setIsTriggering(true);
    setTriggerResult(null);

    try {
      const response = await fetch("/api/jobs/trigger-people-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ serverId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      setTriggerResult({
        success: true,
        message: result.message ?? "People sync triggered successfully",
        timestamp: new Date(),
      });

      // Refresh progress after a short delay
      setTimeout(() => {
        fetchProgress();
      }, 2000);
    } catch (err) {
      setTriggerResult({
        success: false,
        message:
          err instanceof Error ? err.message : "Failed to trigger people sync",
        timestamp: new Date(),
      });
    } finally {
      setIsTriggering(false);
    }
  };

  useEffect(() => {
    fetchProgress();

    // Poll every 30 seconds if sync is not complete
    const interval = setInterval(() => {
      if (!data?.isComplete) {
        fetchProgress();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [serverId, data?.isComplete]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            People Sync Progress
          </CardTitle>
          <CardDescription>
            Syncing actors, directors, and other people from your media
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading progress...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            People Sync Progress
          </CardTitle>
          <CardDescription>
            Syncing actors, directors, and other people from your media
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          People Sync Progress
        </CardTitle>
        <CardDescription>
          Syncing actors, directors, and other people from your media
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {data.isComplete ? (
                <span className="flex items-center gap-1.5 text-green-600 dark:text-green-500">
                  <CheckCircle className="h-4 w-4" />
                  Sync complete
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Syncing in background...
                </span>
              )}
            </span>
            <span className="font-medium">{data.progress}%</span>
          </div>
          <Progress value={data.progress} className="h-2" />
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="space-y-1">
            <p className="text-2xl font-bold">{data.total.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Items</p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-green-600 dark:text-green-500">
              {data.synced.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Synced</p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-500">
              {data.remaining.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Remaining</p>
          </div>
        </div>

        <div className="pt-2">
          <Button
            onClick={handleTriggerSync}
            disabled={isTriggering}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isTriggering ? "animate-spin" : ""}`}
            />
            {isTriggering ? "Triggering..." : "Sync Now"}
          </Button>
        </div>

        {triggerResult && (
          <Alert variant={triggerResult.success ? "default" : "destructive"}>
            {triggerResult.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertDescription className="space-y-1">
              <div>{triggerResult.message}</div>
              <div className="text-xs opacity-75">
                {triggerResult.timestamp.toLocaleString()}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {!data.isComplete && (
          <div className="bg-muted/50 border rounded-lg p-3">
            <p className="text-sm text-muted-foreground">
              People data is continuously synced from Jellyfin and updated every
              15 minutes. This process runs in the background and might affect
              performance due to People being a heavy database operation on the
              Jellyfin side.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
