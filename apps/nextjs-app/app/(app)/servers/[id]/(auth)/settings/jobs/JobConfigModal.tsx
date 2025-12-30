"use client";

import type { JobKey } from "@streamystats/database";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { resetJobConfig, updateJobConfig } from "./actions";

interface CronJobConfigModalProps {
  type: "cron";
  defaultCron: string;
  currentCron: string | null;
}

interface IntervalJobConfigModalProps {
  type: "interval";
  defaultInterval: number;
  currentInterval: number | null;
}

type JobConfigModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: number;
  jobKey: string;
  jobLabel: string;
  description: string;
  enabled: boolean;
  onSave: () => void;
} & (CronJobConfigModalProps | IntervalJobConfigModalProps);

// Simple cron validation
function isValidCron(expr: string): boolean {
  const cronRegex =
    /^(\*|[0-9,-/*]+)\s+(\*|[0-9,-/*]+)\s+(\*|[0-9,-/*]+)\s+(\*|[0-9,-/*]+)\s+(\*|[0-9,-/*]+)$/;
  return cronRegex.test(expr.trim());
}

export function JobConfigModal(props: JobConfigModalProps) {
  const {
    open,
    onOpenChange,
    serverId,
    jobKey,
    jobLabel,
    description,
    enabled: initialEnabled,
    onSave,
  } = props;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [useDefault, setUseDefault] = useState(
    props.type === "cron" ? !props.currentCron : props.currentInterval === null,
  );

  // Cron-specific state
  const [cronExpression, setCronExpression] = useState(
    props.type === "cron" ? props.currentCron || props.defaultCron : "",
  );
  const [cronError, setCronError] = useState<string | null>(null);

  // Interval-specific state
  const [intervalSeconds, setIntervalSeconds] = useState(
    props.type === "interval"
      ? (props.currentInterval ?? props.defaultInterval)
      : 5,
  );
  const [intervalError, setIntervalError] = useState<string | null>(null);

  // Reset form when modal opens with new data
  useEffect(() => {
    if (open) {
      setEnabled(initialEnabled);
      if (props.type === "cron") {
        setUseDefault(!props.currentCron);
        setCronExpression(props.currentCron || props.defaultCron);
        setCronError(null);
      } else {
        setUseDefault(props.currentInterval === null);
        setIntervalSeconds(props.currentInterval ?? props.defaultInterval);
        setIntervalError(null);
      }
    }
  }, [open, initialEnabled, props]);

  const handleCronChange = (value: string) => {
    setCronExpression(value);
    if (value && !isValidCron(value)) {
      setCronError("Invalid cron format. Use: minute hour day month weekday");
    } else {
      setCronError(null);
    }
  };

  const handleIntervalChange = (value: string) => {
    const num = Number.parseInt(value, 10);
    if (Number.isNaN(num) || num < 1) {
      setIntervalError("Interval must be at least 1 second");
      setIntervalSeconds(num || 1);
    } else {
      setIntervalError(null);
      setIntervalSeconds(num);
    }
  };

  const handleSubmit = async () => {
    if (props.type === "cron") {
      if (!useDefault && cronExpression && !isValidCron(cronExpression)) {
        setCronError("Invalid cron format");
        return;
      }
    } else {
      if (!useDefault && intervalSeconds < 1) {
        setIntervalError("Interval must be at least 1 second");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (useDefault && enabled) {
        // Reset to default (delete override)
        const result = await resetJobConfig(serverId, jobKey as JobKey);
        if (result.success) {
          toast.success("Job configuration reset to default");
          onSave();
          onOpenChange(false);
        } else {
          toast.error(result.error || "Failed to reset configuration");
        }
      } else {
        // Update configuration
        const config =
          props.type === "cron"
            ? {
                cronExpression: useDefault ? null : cronExpression,
                enabled,
              }
            : {
                intervalSeconds: useDefault ? null : intervalSeconds,
                enabled,
              };

        const result = await updateJobConfig(
          serverId,
          jobKey as JobKey,
          config,
        );
        if (result.success) {
          toast.success("Job configuration updated");
          onSave();
          onOpenChange(false);
        } else {
          toast.error(result.error || "Failed to update configuration");
        }
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    setIsSubmitting(true);
    try {
      const result = await resetJobConfig(serverId, jobKey as JobKey);
      if (result.success) {
        toast.success("Job configuration reset to default");
        setEnabled(true);
        setUseDefault(true);
        if (props.type === "cron") {
          setCronExpression(props.defaultCron);
        } else {
          setIntervalSeconds(props.defaultInterval);
        }
        onSave();
        onOpenChange(false);
      } else {
        toast.error(result.error || "Failed to reset configuration");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const defaultValue =
    props.type === "cron" ? props.defaultCron : `${props.defaultInterval}s`;

  const hasError =
    props.type === "cron"
      ? !!cronError && !useDefault
      : !!intervalError && !useDefault;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Configure {jobLabel}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enabled">Enabled</Label>
              <p className="text-sm text-muted-foreground">
                Enable or disable this job for this server
              </p>
            </div>
            <Switch
              id="enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {/* Use default toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="useDefault">Use Default</Label>
              <p className="text-sm text-muted-foreground">
                Default:{" "}
                <code className="bg-muted px-1 rounded">{defaultValue}</code>
              </p>
            </div>
            <Switch
              id="useDefault"
              checked={useDefault}
              onCheckedChange={(checked) => {
                setUseDefault(checked);
                if (checked) {
                  if (props.type === "cron") {
                    setCronExpression(props.defaultCron);
                    setCronError(null);
                  } else {
                    setIntervalSeconds(props.defaultInterval);
                    setIntervalError(null);
                  }
                }
              }}
            />
          </div>

          {/* Custom value input */}
          {!useDefault && props.type === "cron" && (
            <div className="space-y-2">
              <Label htmlFor="cronExpression">Cron Expression</Label>
              <Input
                id="cronExpression"
                placeholder="*/5 * * * *"
                value={cronExpression}
                onChange={(e) => handleCronChange(e.target.value)}
                className={cronError ? "border-destructive" : ""}
              />
              {cronError && (
                <p className="text-sm text-destructive">{cronError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Format: minute hour day month weekday
              </p>
            </div>
          )}

          {!useDefault && props.type === "interval" && (
            <div className="space-y-2">
              <Label htmlFor="intervalSeconds">Interval (seconds)</Label>
              <Input
                id="intervalSeconds"
                type="number"
                min={1}
                placeholder="5"
                value={intervalSeconds}
                onChange={(e) => handleIntervalChange(e.target.value)}
                className={intervalError ? "border-destructive" : ""}
              />
              {intervalError && (
                <p className="text-sm text-destructive">{intervalError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                How often to poll for active sessions (minimum 1 second)
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            Reset to Default
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || hasError}
              className="flex-1 sm:flex-none"
            >
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
