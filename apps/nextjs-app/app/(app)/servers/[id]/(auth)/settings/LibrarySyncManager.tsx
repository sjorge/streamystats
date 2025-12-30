"use client";

import { AlertTriangle, CheckCircle, Loader, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetch } from "@/lib/utils";

interface LibrarySyncManagerProps {
  serverId: number;
}

interface LibraryData {
  id: string;
  name: string;
  type: string;
}

interface SyncResult {
  success: boolean;
  message: string;
  timestamp: Date;
}

export function LibrarySyncManager({ serverId }: LibrarySyncManagerProps) {
  const [libraries, setLibraries] = useState<LibraryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncingLibraries, setSyncingLibraries] = useState<Set<string>>(
    new Set(),
  );
  const [syncResults, setSyncResults] = useState<Map<string, SyncResult>>(
    new Map(),
  );

  useEffect(() => {
    const loadLibraries = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/libraries?serverId=${serverId}`);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setLibraries(data.libraries || []);
      } catch (error) {
        console.error("Error loading libraries:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLibraries();
  }, [serverId]);

  const handleSyncLibrary = async (libraryId: string, libraryName: string) => {
    setSyncingLibraries((prev) => new Set(prev).add(libraryId));
    setSyncResults((prev) => {
      const newMap = new Map(prev);
      newMap.delete(libraryId);
      return newMap;
    });

    try {
      const response = await fetch("/api/jobs/trigger-library-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ serverId, libraryId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const data = await response.json();

      setSyncResults((prev) => {
        const newMap = new Map(prev);
        newMap.set(libraryId, {
          success: true,
          message: data.message || `Sync triggered for ${libraryName}`,
          timestamp: new Date(),
        });
        return newMap;
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to trigger library sync";

      setSyncResults((prev) => {
        const newMap = new Map(prev);
        newMap.set(libraryId, {
          success: false,
          message: errorMessage,
          timestamp: new Date(),
        });
        return newMap;
      });
    } finally {
      setSyncingLibraries((prev) => {
        const newSet = new Set(prev);
        newSet.delete(libraryId);
        return newSet;
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Library Sync</CardTitle>
          <CardDescription>
            Sync individual libraries from your Jellyfin server
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Library Sync</CardTitle>
        <CardDescription>
          Sync individual libraries from your Jellyfin server
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {libraries.length === 0 ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              No libraries found for this server. Make sure libraries have been
              synced first.
            </AlertDescription>
          </Alert>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Library</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {libraries.map((library) => {
                const isSyncing = syncingLibraries.has(library.id);
                const result = syncResults.get(library.id);

                return (
                  <TableRow key={library.id}>
                    <TableCell className="font-medium">
                      {library.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{library.type}</Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {result && (
                        <div className="flex items-center gap-2">
                          {result.success ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          )}
                          <span
                            className={
                              result.success
                                ? "text-muted-foreground"
                                : "text-destructive"
                            }
                          >
                            {result.success ? "Triggered" : result.message}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() =>
                          handleSyncLibrary(library.id, library.name)
                        }
                        disabled={isSyncing}
                        variant="outline"
                        size="sm"
                      >
                        {isSyncing ? (
                          <>
                            <Loader className="h-4 w-4 animate-spin mr-2" />
                            Syncing
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Sync
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <div className="bg-muted/50 border rounded-lg p-3">
          <p className="text-sm text-muted-foreground">
            Library syncs will update all items in the selected library. The
            sync runs in the background.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
