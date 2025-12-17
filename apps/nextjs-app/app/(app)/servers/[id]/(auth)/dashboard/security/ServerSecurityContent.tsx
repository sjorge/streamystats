"use client";

import { type LocationPoint, UserLocationMap } from "@/components/locations";
import { AnomalyList } from "@/components/locations/AnomalyList";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Anomaly } from "@/lib/db/locations";
import {
  resolveAnomaly,
  triggerGeolocationBackfill,
  unresolveAnomaly,
} from "@/lib/db/locations";
import {
  AlertCircle,
  AlertTriangle,
  Globe,
  Info,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

interface ServerSecurityContentProps {
  serverId: number;
  locations: LocationPoint[];
  anomalies: Anomaly[];
  severityBreakdown: Record<string, number>;
  stats: {
    totalLocatedActivities: number;
    pendingActivities: number;
    uniqueCountries: number;
    uniqueCities: number;
    usersWithFingerprints: number;
    unresolvedAnomalies: Record<string, number>;
    isBackfillRunning: boolean;
  };
}

export function ServerSecurityContent({
  serverId,
  locations,
  anomalies,
  severityBreakdown,
  stats,
}: ServerSecurityContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isBackfilling, setIsBackfilling] = useState(stats.isBackfillRunning);

  const handleResolve = async (anomalyId: number, note?: string) => {
    await resolveAnomaly(serverId, anomalyId, { resolutionNote: note });
    startTransition(() => {
      router.refresh();
    });
  };

  const handleUnresolve = async (anomalyId: number) => {
    await unresolveAnomaly(serverId, anomalyId);
    startTransition(() => {
      router.refresh();
    });
  };

  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`?${params.toString()}`);
  };

  const handleBackfill = async () => {
    setIsBackfilling(true);
    try {
      const result = await triggerGeolocationBackfill(serverId);
      if (!result.success) {
        if (result.alreadyRunning) {
          // Job is already running, just refresh to update UI
        } else {
          console.error("Failed to start backfill:", result.error);
        }
      }
      // Refresh after a short delay to allow job to start
      setTimeout(() => {
        startTransition(() => {
          router.refresh();
        });
      }, 1000);
    } catch (error) {
      console.error("Failed to start backfill:", error);
      setIsBackfilling(false);
    }
  };

  const totalUnresolved = Object.values(stats.unresolvedAnomalies).reduce(
    (a, b) => a + b,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Countries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.uniqueCountries}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Cities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.uniqueCities}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              User Profiles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.usersWithFingerprints}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Open Anomalies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalUnresolved}</p>
            {totalUnresolved > 0 && (
              <div className="flex gap-1 mt-1">
                {stats.unresolvedAnomalies.critical && (
                  <Badge variant="destructive" className="text-xs">
                    {stats.unresolvedAnomalies.critical} critical
                  </Badge>
                )}
                {stats.unresolvedAnomalies.high && (
                  <Badge variant="destructive" className="text-xs">
                    {stats.unresolvedAnomalies.high} high
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {stats.pendingActivities > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <span>
                {stats.pendingActivities} activities pending geolocation
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBackfill}
              disabled={isBackfilling || stats.isBackfillRunning}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${
                  isBackfilling || stats.isBackfillRunning ? "animate-spin" : ""
                }`}
              />
              {stats.isBackfillRunning
                ? "Job Running..."
                : isBackfilling
                  ? "Starting..."
                  : "Run Backfill"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="map" className="space-y-4">
        <TabsList>
          <TabsTrigger value="map">Location Map</TabsTrigger>
          <TabsTrigger value="anomalies" className="relative">
            Anomalies
            {totalUnresolved > 0 && (
              <Badge
                variant="destructive"
                className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
              >
                {totalUnresolved}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="map">
          <Card>
            <CardHeader>
              <CardTitle>User Locations</CardTitle>
              <CardDescription>
                Geographic distribution of all user sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserLocationMap locations={locations} height="500px" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anomalies" className="space-y-4">
          <div className="flex items-center gap-4">
            <Select
              value={searchParams.get("resolved") || "all"}
              onValueChange={(value) => handleFilterChange("resolved", value)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="false">Open</SelectItem>
                <SelectItem value="true">Resolved</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={searchParams.get("severity") || "all"}
              onValueChange={(value) => handleFilterChange("severity", value)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            {(searchParams.get("resolved") || searchParams.get("severity")) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("?")}
              >
                Clear filters
              </Button>
            )}
          </div>

          <AnomalyList
            anomalies={anomalies}
            showUserColumn={true}
            onResolve={handleResolve}
            onUnresolve={handleUnresolve}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
