"use client";

import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  Upload,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { fetch } from "@/lib/utils";

interface DatabaseBackupRestoreProps {
  serverId: number;
  lastSyncCompleted: Date | null;
}

export default function DatabaseBackupRestore({
  serverId,
  lastSyncCompleted,
}: DatabaseBackupRestoreProps) {
  const hasCompletedInitialSync = lastSyncCompleted !== null;
  const [file, setFile] = useState<File | null>(null);
  const [importSuccess, setImportSuccess] = useState<{
    message: string;
    imported_count?: number;
    total_count?: number;
  } | null>(null);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/export/${serverId}`, {
        method: "GET",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown" }));
        throw new Error(err.error || "Export failed");
      }
      return res;
    },
    onSuccess: async (res) => {
      const cd = res.headers.get("content-disposition") ?? "";
      const m = cd.match(/filename="?([^"]+)"?/);
      const fn =
        m?.[1] ??
        `streamystats-backup-${new Date().toISOString().split("T")[0]}.json`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fn;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Export complete");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Export failed");
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error("Select a file first");
      }
      const form = new FormData();
      form.set("file", file, file.name);
      form.set("serverId", serverId.toString());
      const res = await fetch("/api/import", {
        method: "POST",
        body: form,
      });
      const payload = await res.json().catch(() => ({
        error: "Invalid response",
      }));
      if (!res.ok) {
        throw new Error(payload.error || "Import failed");
      }
      return payload;
    },
    onSuccess: (data) => {
      // Handle both immediate success and background processing responses
      if (data.status === "processing") {
        toast.success(data.message || "Import started successfully");
        setImportSuccess(null);
      } else {
        setImportSuccess({
          message: data.message || "Import succeeded",
          imported_count: data.imported_count,
          total_count: data.total_count,
        });
        toast.success(data.message || "Import succeeded");
      }
      setFile(null);
    },
    onError: (e) => {
      setImportSuccess(null);
      toast.error(e instanceof Error ? e.message : "Import failed");
    },
  });

  const handleExportClick = () => exportMutation.mutate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setImportSuccess(null);
  };

  const handleImportClick = () => importMutation.mutate();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Streamystats Backup & Restore</CardTitle>
        <CardDescription>
          Export or restore your Streamystats data. Only works with the new
          version of Streamystats.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        {/* EXPORT */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Export Backup</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Download a complete backup of your Streamystats database as a JSON
            file.
          </p>
          {exportMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {exportMutation.error instanceof Error
                  ? exportMutation.error.message
                  : "Export failed"}
              </AlertDescription>
            </Alert>
          )}
          <Button
            onClick={handleExportClick}
            disabled={exportMutation.isPending}
            className="flex items-center gap-2"
          >
            {exportMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download Backup
              </>
            )}
          </Button>
        </div>

        <Separator />

        {/* IMPORT */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Import Backup</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Restore your Streamystats database from a previously exported backup
            file.
          </p>
          {importMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {importMutation.error instanceof Error
                  ? importMutation.error.message
                  : "Import failed"}
              </AlertDescription>
            </Alert>
          )}
          {importSuccess && (
            <Alert
              variant="default"
              className="bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
            >
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertTitle className="text-green-700 dark:text-green-300">
                Success
              </AlertTitle>
              <AlertDescription className="text-green-600 dark:text-green-400">
                {importSuccess.message}
                {importSuccess.imported_count && importSuccess.total_count && (
                  <p className="mt-1">
                    Successfully imported {importSuccess.imported_count} of{" "}
                    {importSuccess.total_count} sessions.
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="backup-file"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Backup File
              </label>
              <Input
                id="backup-file"
                type="file"
                accept=".json"
                disabled={!hasCompletedInitialSync}
                onChange={handleFileChange}
                className="cursor-pointer"
              />
              {file && (
                <p className="text-sm text-muted-foreground">
                  Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)}{" "}
                  MB)
                </p>
              )}
            </div>

            <Button
              onClick={handleImportClick}
              disabled={
                importMutation.isPending || !file || !hasCompletedInitialSync
              }
              className="flex items-center gap-2"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload and Import
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
