"use client";

import {
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  cleanupInferredSessions,
  triggerInferWatchtime,
} from "@/lib/db/infer-watchtime";

interface InferWatchtimeManagerProps {
  serverId: number;
  userId: string;
  userName: string;
  isCurrentUser: boolean;
  inferredSessionCount: number;
}

export function InferWatchtimeManager({
  serverId,
  userId,
  userName,
  isCurrentUser,
  inferredSessionCount: initialCount,
}: InferWatchtimeManagerProps) {
  const [isInferring, setIsInferring] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [inferredCount, setInferredCount] = useState(initialCount);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    timestamp: Date;
  } | null>(null);

  const handleInferWatchtime = async () => {
    setIsInferring(true);
    setResult(null);

    try {
      const response = await triggerInferWatchtime(serverId, userId);

      setResult({
        success: response.success,
        message:
          response.message ||
          (response.success
            ? "Watchtime inference started. This may take a few minutes."
            : "Failed to start inference"),
        timestamp: new Date(),
      });
    } catch (error) {
      setResult({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to start inference",
        timestamp: new Date(),
      });
    } finally {
      setIsInferring(false);
    }
  };

  const handleCleanup = async () => {
    setIsCleaning(true);
    setResult(null);

    try {
      const response = await cleanupInferredSessions(serverId, userId);

      if (response.success) {
        setInferredCount(0);
      }

      setResult({
        success: response.success,
        message: response.message || "Cleanup completed",
        timestamp: new Date(),
      });
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : "Failed to cleanup",
        timestamp: new Date(),
      });
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Infer Watch History
        </CardTitle>
        <CardDescription>
          {isCurrentUser
            ? "Import your watch history from Jellyfin's played status"
            : `Import watch history for ${userName} from Jellyfin`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            This feature creates watch sessions based on items marked as
            "Played" in Jellyfin:
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 ml-4">
            <li>- Creates sessions for played movies and episodes</li>
            <li>- Uses the "Last Played Date" as the session timestamp</li>
            <li>- Sets 100% watch completion for each item</li>
            <li>- Skips items that already have sessions</li>
          </ul>
        </div>

        {inferredCount > 0 && (
          <div className="bg-muted/50 border rounded-lg p-3">
            <p className="text-sm">
              <span className="font-medium">{inferredCount}</span> inferred{" "}
              {inferredCount === 1 ? "session" : "sessions"} currently exist
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleInferWatchtime}
            disabled={isInferring || isCleaning}
            className="flex items-center gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isInferring ? "animate-spin" : ""}`}
            />
            {isInferring ? "Inferring..." : "Infer Watch History"}
          </Button>

          {inferredCount > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={isInferring || isCleaning}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  {isCleaning ? "Cleaning..." : "Remove Inferred"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove Inferred Sessions?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {inferredCount} inferred{" "}
                    {inferredCount === 1 ? "session" : "sessions"} for{" "}
                    {isCurrentUser ? "you" : userName}. Real watch sessions will
                    not be affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCleanup}>
                    Remove All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {result && (
          <Alert variant={result.success ? "default" : "destructive"}>
            {result.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertDescription className="space-y-1">
              <div>{result.message}</div>
              <div className="text-xs opacity-75">
                {result.timestamp.toLocaleString()}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="bg-muted/50 border rounded-lg p-3">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Inferred sessions are marked separately and
            can be removed at any time. Real sessions from actual playback are
            never affected.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
