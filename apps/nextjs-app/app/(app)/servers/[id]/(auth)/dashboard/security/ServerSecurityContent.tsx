"use client";

import { type LocationPoint, UserLocationMap } from "@/components/locations";
import { AnomalyList } from "@/components/locations/AnomalyList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  resolveAllAnomalies,
  resolveAnomaly,
  triggerGeolocationBackfill,
  unresolveAnomaly,
} from "@/lib/db/locations";
import { format, isValid, parseISO } from "date-fns";
import {
  AlertCircle,
  CalendarIcon,
  Globe,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { DateRange } from "react-day-picker";

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
  users: { id: string; name: string }[];
}

export function ServerSecurityContent({
  serverId,
  locations,
  anomalies,
  severityBreakdown,
  stats,
  users,
}: ServerSecurityContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isBackfilling, setIsBackfilling] = useState(stats.isBackfillRunning);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const hasLocationFilters =
    searchParams.get("userId") ||
    searchParams.get("dateFrom") ||
    searchParams.get("dateTo");

  const dateRange = useMemo((): DateRange | undefined => {
    const fromStr = searchParams.get("dateFrom");
    const toStr = searchParams.get("dateTo");
    const from = fromStr ? parseISO(fromStr) : undefined;
    const to = toStr ? parseISO(toStr) : undefined;
    if (from && isValid(from) && to && isValid(to)) {
      return { from, to };
    }
    if (from && isValid(from)) {
      return { from };
    }
    return undefined;
  }, [searchParams]);

  const dateRangeLabel = useMemo(() => {
    if (!dateRange?.from) return "Date range";
    if (!dateRange.to) return format(dateRange.from, "MMM dd, yyyy");
    return `${format(dateRange.from, "MMM dd")} - ${format(
      dateRange.to,
      "MMM dd, yyyy"
    )}`;
  }, [dateRange]);

  const handleDateRangeSelect = (range: DateRange | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (range?.from) {
      params.set("dateFrom", format(range.from, "yyyy-MM-dd"));
    } else {
      params.delete("dateFrom");
    }
    if (range?.to) {
      params.set("dateTo", format(range.to, "yyyy-MM-dd"));
      setDatePickerOpen(false);
    } else {
      params.delete("dateTo");
    }
    router.push(`?${params.toString()}`);
  };

  const clearLocationFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("userId");
    params.delete("dateFrom");
    params.delete("dateTo");
    router.push(`?${params.toString()}`);
  };

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

  const handleResolveAll = async () => {
    await resolveAllAnomalies(serverId);
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
    0
  );

  // When filters are applied, show filtered count; otherwise show total unresolved
  const filteredUnresolvedCount = anomalies.filter((a) => !a.resolved).length;
  const badgeCount = hasLocationFilters ? filteredUnresolvedCount : totalUnresolved;

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <TabsList>
            <TabsTrigger value="map">Location Map</TabsTrigger>
            <TabsTrigger value="anomalies" className="relative">
              Anomalies
              {badgeCount > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                >
                  {badgeCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Select
              value={searchParams.get("userId") || "all"}
              onValueChange={(value) => handleFilterChange("userId", value)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[200px] justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRangeLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={handleDateRangeSelect}
                  numberOfMonths={2}
                  disabled={(date) => date > new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {hasLocationFilters && (
              <Button
                variant="ghost"
                size="icon"
                onClick={clearLocationFilters}
                title="Clear filters"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="map" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Locations</CardTitle>
              <CardDescription>
                Geographic distribution of all user sessions
                {hasLocationFilters && " (filtered)"}
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
            onResolveAll={handleResolveAll}
            hasFilters={
              hasLocationFilters ||
              !!searchParams.get("resolved") ||
              !!searchParams.get("severity")
            }
            onClearFilters={() => router.push("?")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
