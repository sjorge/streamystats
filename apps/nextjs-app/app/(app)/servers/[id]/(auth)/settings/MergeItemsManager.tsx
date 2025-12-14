"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { GitMerge, CheckCircle, AlertTriangle, Loader } from "lucide-react";
import { fetch } from "@/lib/utils";

interface MergeItemsManagerProps {
  serverId: number;
}

interface MergeResult {
  success: boolean;
  message: string;
  metrics?: {
    sessionsMigrated: number;
    hiddenRecommendationsMigrated: number;
  };
}

export function MergeItemsManager({ serverId }: MergeItemsManagerProps) {
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{
    result: MergeResult;
    timestamp: Date;
  } | null>(null);

  const handleMerge = async () => {
    if (!leftId.trim() || !rightId.trim()) {
      setLastResult({
        result: {
          success: false,
          message: "Both item IDs are required",
        },
        timestamp: new Date(),
      });
      return;
    }

    setIsRunning(true);
    setLastResult(null);

    try {
      const response = await fetch("/api/items/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leftId: leftId.trim(),
          rightId: rightId.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      setLastResult({
        result: data,
        timestamp: new Date(),
      });

      setLeftId("");
      setRightId("");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to merge items";

      setLastResult({
        result: {
          success: false,
          message: errorMessage,
        },
        timestamp: new Date(),
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitMerge className="h-5 w-5" />
          Merge Items
        </CardTitle>
        <CardDescription>
          Merge two items by converting the left item into the right item. Watch
          stats and other data will be migrated.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">This will:</p>
          <ul className="text-sm text-muted-foreground space-y-1 ml-4">
            <li>- Migrate all watch sessions from left item to right item</li>
            <li>
              - Migrate hidden recommendations from left item to right item
            </li>
            <li>- Delete the left item from the database</li>
            <li>- Preserve all watch statistics and history</li>
          </ul>
        </div>

        <div className="pt-2 flex flex-row gap-2 items-end">
          <div className="space-y-2 flex-1">
            <Label htmlFor="left-id">Left Item ID (source)</Label>
            <Input
              id="left-id"
              placeholder="Enter item ID to merge from"
              value={leftId}
              onChange={(e) => setLeftId(e.target.value)}
              disabled={isRunning}
            />
          </div>

          <div className="space-y-2 flex-1">
            <Label htmlFor="right-id">Right Item ID (target)</Label>
            <Input
              id="right-id"
              placeholder="Enter item ID to merge into"
              value={rightId}
              onChange={(e) => setRightId(e.target.value)}
              disabled={isRunning}
            />
          </div>

          <Button
            onClick={handleMerge}
            disabled={isRunning || !leftId.trim() || !rightId.trim()}
            variant="outline"
            className="flex items-center gap-2"
          >
            {isRunning ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              <GitMerge className="h-4 w-4" />
            )}
            {isRunning ? "Merging..." : "Merge Items"}
          </Button>
        </div>

        {lastResult && (
          <Alert
            variant={lastResult.result.success ? "default" : "destructive"}
            className="mt-4"
          >
            {lastResult.result.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertDescription className="space-y-2">
              <div>{lastResult.result.message}</div>

              {lastResult.result.metrics && (
                <div className="text-xs space-y-1 mt-2 opacity-80">
                  <div className="grid grid-cols-2 gap-x-4">
                    <span>Sessions migrated:</span>
                    <span>
                      {lastResult.result.metrics.sessionsMigrated.toLocaleString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4">
                    <span>Hidden recommendations migrated:</span>
                    <span>
                      {lastResult.result.metrics.hiddenRecommendationsMigrated.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              <div className="text-xs opacity-75">
                {lastResult.timestamp.toLocaleString()}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="bg-muted/50 border rounded-lg p-3">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> This operation merges the left item into the
            right item. The left item will be permanently deleted and all its
            watch history and recommendations will be transferred to the right
            item. Both items must exist and be from the same server.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
