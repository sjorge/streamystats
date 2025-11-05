"use client";

import { useState, useEffect, memo, useRef } from "react";
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
import { Button } from "@/components/ui/button";
import { formatDateUS, formatDuration } from "@/lib/utils";
import { ItemUserStats } from "@/lib/db/items";
import { Users, Search, X, Loader2 } from "lucide-react";

interface ViewerDetailsDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	itemId: string;
	serverId: number;
}

type SortBy =
	| "watchCount"
	| "totalWatchTime"
	| "completionRate"
	| "lastWatched"
	| "userName";
type SortOrder = "asc" | "desc";
enum CompletionState {
  all = "all",
  completed = "completed",
  partial = "partial",
  minimal = "minimal",
}

interface ApiResponse {
	data: ItemUserStats[];
	pagination: {
		page: number;
		pageSize: number;
		total: number;
		totalPages: number;
	};
}

function getCompletionBadgeVariant(
	completionRate: number,
): "default" | "secondary" | "outline" {
	if (completionRate >= 90) return "default";
	if (completionRate >= 50) return "secondary";
	return "outline";
}

// Only memoize the row component to prevent unnecessary re-renders of individual rows
const ViewerRow = memo(({ viewer }: { viewer: ItemUserStats }) => (
	<TableRow className="hover:bg-muted/30">
		<TableCell className="font-medium">{viewer.user.name}</TableCell>
		<TableCell className="text-center font-semibold">
			{viewer.watchCount}
		</TableCell>
		<TableCell>{formatDuration(viewer.totalWatchTime)}</TableCell>
		<TableCell>
			<Badge variant={getCompletionBadgeVariant(viewer.completionRate)}>
				{viewer.completionRate.toFixed(1)}%
			</Badge>
		</TableCell>
		<TableCell className="text-sm text-muted-foreground">
			{formatDateUS(viewer.lastWatched)}
		</TableCell>
	</TableRow>
));
ViewerRow.displayName = "ViewerRow";

export function ViewerDetailsDialog({
	isOpen,
	onOpenChange,
	itemId,
	serverId,
}: ViewerDetailsDialogProps) {
	const [sortBy, setSortBy] = useState<SortBy>("lastWatched");
	const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
	const [searchQuery, setSearchQuery] = useState("");
	const [completion, setCompletion] = useState<CompletionState>(CompletionState.all);
	const [currentPage, setCurrentPage] = useState(1);
	const [pageSize] = useState(5);

	const [apiData, setApiData] = useState<ApiResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const searchInputRef = useRef<HTMLInputElement>(null);
	const wasSearchFocused = useRef(false);

	const handleSort = (field: SortBy) => {
		if (sortBy === field) {
			setSortOrder(sortOrder === "asc" ? "desc" : "asc");
		} else {
			setSortBy(field);
			setSortOrder("desc");
		}
		setCurrentPage(1);
	};

	useEffect(() => {
		if (!isLoading && wasSearchFocused.current && searchInputRef.current) {
			searchInputRef.current.focus();
			wasSearchFocused.current = false;
		}
	}, [isLoading]);

	useEffect(() => {
		if (!isOpen) return;

		const fetchViewers = async () => {
			// Track if search input is focused before we start loading
			wasSearchFocused.current =
				document.activeElement === searchInputRef.current;

			setIsLoading(true);
			try {
				const params = new URLSearchParams({
					page: currentPage.toString(),
					pageSize: pageSize.toString(),
					search: searchQuery,
					sortBy,
					completion,
					sortOrder,
				});

				const response = await fetch(
					`/api/servers/${serverId}/items/${itemId}/viewers?${params}`,
					{ method: "GET" },
				);

				if (!response.ok) {
					throw new Error("Failed to fetch viewers");
				}

				const data: ApiResponse = await response.json();
				setApiData(data);
			} catch (error) {
				console.error("Error fetching viewers from API: ", error);
			} finally {
				setIsLoading(false);
			}
		};

		const debounceTimer = setTimeout(fetchViewers, 300);
		return () => clearTimeout(debounceTimer);
	}, [
		isOpen,
		currentPage,
		pageSize,
		searchQuery,
		completion,
		sortBy,
		sortOrder,
		itemId,
		serverId,
	]);

	const SortHeader = ({
		field,
		label,
	}: {
		field: SortBy;
		label: string;
	}) => (
		<TableHead
			className="cursor-pointer hover:bg-muted/70 select-none"
			onClick={() => handleSort(field)}
		>
			<div className="flex items-center gap-1">
				<span>{label}</span>
				{sortBy === field && (
					<span className="text-xs font-bold">
						{sortOrder === "asc" ? "↑" : "↓"}
					</span>
				)}
			</div>
		</TableHead>
	);

	const displayViewers = apiData?.data ?? [];
	const pagination = apiData?.pagination ?? null;

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
				<DialogHeader className="pb-2">
					<DialogTitle className="flex items-center gap-2">
						<Users className="w-5 h-5" />
						Viewers Details
					</DialogTitle>
				</DialogHeader>

				{/* Search and Filters */}
				<div className="space-y-3 px-6 pb-4 border-b">
					{/* Search Input */}
					<div className="relative">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
						<Input
							ref={searchInputRef}
							placeholder="Search by username..."
							value={searchQuery}
							onChange={(e) => {
								setSearchQuery(e.target.value);
								setCurrentPage(1);
							}}
							className="pl-10 pr-10"
							disabled={isLoading}
						/>
						{searchQuery && (
							<button
								onClick={() => {
									setSearchQuery("");
									setCurrentPage(1);
								}}
								className="absolute right-3 top-1/2 transform -translate-y-1/2"
							>
								<X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
							</button>
						)}
					</div>

					{/* Filter Buttons */}
					<div className="flex flex-wrap gap-2">
						<span className="text-sm text-muted-foreground self-center">
							Filter:
						</span>
						{[
							{ value: CompletionState.all, label: "All" },
							{ value: CompletionState.completed, label: "Completed (90%+)" },
							{ value: CompletionState.partial, label: "Partial (50-89%)" },
							{ value: CompletionState.minimal, label: "Minimal (<50%)" },
						].map(({ value, label }) => (
							<Badge
								key={value}
								variant={completion === value ? "default" : "outline"}
								className="cursor-pointer"
								onClick={() => {
									setCompletion(value);
									setCurrentPage(1);
								}}
							>
								{label}
							</Badge>
						))}
					</div>
				</div>

				{/* Loading State */}
				{isLoading && (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
						<span className="ml-2 text-sm text-muted-foreground">
							Loading...
						</span>
					</div>
				)}

				{/* Table */}
				{!isLoading && (
					<div className="overflow-auto flex-1 px-6">
						{displayViewers.length === 0 ? (
							<div className="text-center py-8 text-muted-foreground">
								{searchQuery || completion !== "all"
									? "No viewers match your search or filters"
									: "No viewers yet for this item"}
							</div>
						) : (
							<Table>
								<TableHeader className="sticky top-0 bg-background">
									<TableRow>
										<SortHeader field="userName" label="Username" />
										<SortHeader field="watchCount" label="Plays" />
										<SortHeader field="totalWatchTime" label="Time Watched" />
										<SortHeader field="completionRate" label="Completion" />
										<SortHeader field="lastWatched" label="Last Watched" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{displayViewers.map((viewer: ItemUserStats) => (
										<ViewerRow key={viewer.user.id} viewer={viewer} />
									))}
								</TableBody>
							</Table>
						)}
					</div>
				)}

				{/* Pagination Controls */}
				{!isLoading && pagination && (
					<div className="px-6 py-3 border-t flex items-center justify-between">
						<div className="text-sm text-neutral-500">
							{pagination.total === 0
								? 0
								: (pagination.page - 1) * pagination.pageSize + 1}{" "}
							-{" "}
							{(pagination.page - 1) * pagination.pageSize +
								displayViewers.length}{" "}
							of {pagination.total} results.
						</div>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
								disabled={currentPage === 1 || pagination.total === 0}
							>
								Previous
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									setCurrentPage(
										Math.min(pagination.totalPages, currentPage + 1),
									)
								}
								disabled={
									currentPage === pagination.totalPages ||
									pagination.total === 0
								}
							>
								Next
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
