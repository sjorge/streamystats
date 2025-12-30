"use client";

import { AlertTriangle, CheckCircle, Loader2, RefreshCw } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
          <CardTitle>People Sync</CardTitle>
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
          <CardTitle>People Sync</CardTitle>
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
        <CardTitle>People Sync</CardTitle>
        <CardDescription>
          Syncing actors, directors, and other people from your media items from
          Jellyfin. This job is specifically separated from the normal item sync
          due to the fact that including people in an item query is a very heavy
          calculation on the Jellyfin server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Total</TableHead>
              <TableHead>Synced</TableHead>
              <TableHead>Remaining</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">
                {data.total.toLocaleString()}
              </TableCell>
              <TableCell className="font-medium text-green-600 dark:text-green-500">
                {data.synced.toLocaleString()}
              </TableCell>
              <TableCell className="font-medium text-amber-600 dark:text-amber-500">
                {data.remaining.toLocaleString()}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress value={data.progress} className="w-16 h-2" />
                  <span className="font-medium">{data.progress}%</span>
                </div>
              </TableCell>
              <TableCell>
                {data.isComplete ? (
                  <span className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-500">
                    <CheckCircle className="h-4 w-4" />
                    Complete
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Syncing
                  </span>
                )}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <div className="flex items-center justify-between">
          <Button
            onClick={handleTriggerSync}
            disabled={isTriggering}
            variant="outline"
            size="sm"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isTriggering ? "animate-spin" : ""}`}
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
            <AlertDescription>{triggerResult.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
