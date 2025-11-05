"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatDateUS, formatDuration } from "@/lib/utils";
import { ItemUserStats } from "@/lib/db/items";
import { Users, Search, X } from "lucide-react";

interface ViewerDetailsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  viewers: ItemUserStats[];
}

type SortField = "watchCount" | "totalWatchTime" | "completionRate" | "lastWatched" | "userName";
type SortOrder = "asc" | "desc";
type CompletionState = "all" | "completed" | "partial" | "started";

function getCompletion(completion: CompletionState, value: number): boolean {
  switch (completion) {
    case "completed":
      return value >= 90;
    case "partial":
      return value >= 50 && value < 90;
    case "started":
      return value < 50;
    case "all":
    default:
      return true;
  }
}

function getCompletionBadgeVariant(
  completionRate: number
): "default" | "secondary" | "outline" | "destructive" {
  if (completionRate >= 90) return "default";
  if (completionRate >= 50) return "secondary";
  return "outline";
}

function getCompletionColor(completionRate: number): string {
  if (completionRate >= 90) return "bg-green-500";
  if (completionRate >= 75) return "bg-blue-500";
  if (completionRate >= 50) return "bg-yellow-500";
  return "bg-orange-500";
}

export function ViewerDetailsDialog({
  isOpen,
  onOpenChange,
  viewers,
}: ViewerDetailsDialogProps) {
  const [sortField, setSortField] = useState<SortField>("lastWatched");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [completionFilter, setCompletionFilter] = useState<CompletionState>("all");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const filteredAndSortedViewers = useMemo(() => {
    let filtered = [...viewers];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((viewer) =>
        viewer.user.name.toLowerCase().includes(query)
      );
    }

    // Apply completion filter
    if (completionFilter !== "all") {
      filtered = filtered.filter((viewer) => {
        return getCompletion(completionFilter, viewer.completionRate);
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: number | string = 0;
      let bValue: number | string = 0;

      switch (sortField) {
        case "userName":
          aValue = a.user.name.toLowerCase();
          bValue = b.user.name.toLowerCase();
          break;
        case "watchCount":
          aValue = a.watchCount;
          bValue = b.watchCount;
          break;
        case "totalWatchTime":
          aValue = a.totalWatchTime;
          bValue = b.totalWatchTime;
          break;
        case "completionRate":
          aValue = a.completionRate;
          bValue = b.completionRate;
          break;
        case "lastWatched":
          aValue = a.lastWatched || "";
          bValue = b.lastWatched || "";
          break;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortOrder === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      const numA = Number(aValue) || 0;
      const numB = Number(bValue) || 0;
      return sortOrder === "asc" ? numA - numB : numB - numA;
    });

    return filtered;
  }, [viewers, searchQuery, completionFilter, sortField, sortOrder]);

  const SortHeader = ({
    field,
    label,
  }: {
    field: SortField;
    label: string;
  }) => (
    <TableHead
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortField === field && (
          <span className="text-xs font-semibold">
            {sortOrder === "asc" ? "↑" : "↓"}
          </span>
        )}
      </div>
    </TableHead>
  );

  const CompletionProgressBar = ({ rate }: { rate: number }) => (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${getCompletionColor(rate)}`}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
      <span className="text-sm font-medium w-12 text-right">{rate.toFixed(1)}%</span>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Viewers Details
            <Badge variant="secondary">{filteredAndSortedViewers.length}</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Search and Filter Controls */}
        <div className="space-y-3 px-6">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Completion Filter */}
          <div className="flex gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground py-2">Filter by completion:</span>
            {(["all", "completed", "partial", "started"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setCompletionFilter(filter)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  completionFilter === filter
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {filter === "all" && `All (${viewers.length})`}
                {filter === "completed" && `Completed (${viewers.filter(v => getCompletion("completed", v.completionRate)).length})`}
                {filter === "partial" && `Partial (${viewers.filter(v => getCompletion("partial", v.completionRate)).length})`}
                {filter === "started" && `Started (${viewers.filter(v => getCompletion("started", v.completionRate)).length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 px-6">
          {filteredAndSortedViewers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery || completionFilter !== "all"
                ? "No viewers match your filters"
                : "No viewers yet for this item"}
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-background border-b">
                <TableRow>
                  <SortHeader field="userName" label="Username" />
                  <SortHeader field="watchCount" label="Watch Count" />
                  <SortHeader field="totalWatchTime" label="Total Time" />
                  <SortHeader field="completionRate" label="Completion" />
                  <SortHeader field="lastWatched" label="Last Watched" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedViewers.map((viewer, index) => (
                  <TableRow
                    key={viewer.user.id}
                    className={index % 2 === 0 ? "bg-background" : "bg-muted/30"}
                  >
                    <TableCell className="font-medium">
                      {viewer.user.name}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {viewer.watchCount}
                    </TableCell>
                    <TableCell>
                      {formatDuration(viewer.totalWatchTime)}
                    </TableCell>
                    <TableCell>
                      <CompletionProgressBar rate={viewer.completionRate} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateUS(viewer.lastWatched)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Footer Stats */}
        {filteredAndSortedViewers.length > 0 && (
          <div className="border-t px-6 py-3 bg-muted/50 text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>
                Showing {filteredAndSortedViewers.length} of {viewers.length} viewers
              </span>
              <span>
                Avg Completion: {(filteredAndSortedViewers.reduce((sum, v) => sum + v.completionRate, 0) / filteredAndSortedViewers.length).toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
