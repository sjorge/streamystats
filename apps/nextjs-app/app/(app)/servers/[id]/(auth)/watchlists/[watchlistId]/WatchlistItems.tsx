"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Film, Tv, Trash2, ArrowUpDown, ChevronDown } from "lucide-react";
import { useDebounce } from "use-debounce";
import type { WatchlistWithItems, WatchlistItemWithDetails } from "@/lib/db/watchlists";
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePersistantState } from "@/hooks/usePersistantState";
import { useQueryParams } from "@/hooks/useQueryParams";
import { formatLocalDate } from "@/lib/timezone";
import { Poster } from "@/app/(app)/servers/[id]/(auth)/dashboard/Poster";
import type { Server } from "@/lib/types";

interface WatchlistItemsProps {
  watchlist: WatchlistWithItems;
  isOwner: boolean;
  serverUrl: string;
  currentType?: string;
  currentSort?: string;
}

export function WatchlistItems({
  watchlist,
  isOwner,
  serverUrl,
  currentType,
  currentSort,
}: WatchlistItemsProps) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const serverIdParam = params.id as string;
  const { updateQueryParams, isLoading } = useQueryParams();
  const [items, setItems] = useState(watchlist.items);

  const currentPage = Number(searchParams.get("page") || "1");
  const currentSearch = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState<string>(currentSearch);
  const [debouncedSearch] = useDebounce(searchInput, 500);

  const server: Server = React.useMemo(
    () => ({
      id: Number(serverIdParam),
      url: serverUrl,
    } as Server),
    [serverIdParam, serverUrl],
  );

  React.useEffect(() => {
    if (debouncedSearch !== currentSearch) {
      updateQueryParams({
        search: debouncedSearch || null,
        page: "1",
      });
    }
  }, [debouncedSearch, currentSearch, updateQueryParams]);

  const handleTypeChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set("type", value);
    } else {
      params.delete("type");
    }
    params.delete("page");
    router.push(`?${params.toString()}`);
  };

  const handleSortChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", value);
    params.delete("page");
    router.push(`?${params.toString()}`);
  };

  const handleRemoveItem = async (itemId: string) => {
    const res = await fetch(`/api/watchlists/${watchlist.id}/items/${itemId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setItems(items.filter((i) => i.item.id !== itemId));
      router.refresh();
    }
  };

  const handlePageChange = (newPage: number) => {
    updateQueryParams({
      page: newPage.toString(),
    });
  };

  const columns: ColumnDef<WatchlistItemWithDetails>[] = [
    {
      accessorFn: (row) => row.item?.name || "",
      id: "item_name",
      header: "Item",
      cell: ({ row }) => {
        const watchlistItem = row.original;
        const item = watchlistItem.item;
        return (
          <Link
            href={`/servers/${serverIdParam}/library/${item.id}`}
            className="flex flex-row items-center gap-4 cursor-pointer group"
          >
            <div className="shrink-0 rounded overflow-hidden">
              <Poster
                item={{
                  id: item.id,
                  name: item.name,
                  type: item.type,
                  primaryImageTag: item.primaryImageTag,
                  primaryImageThumbTag: item.primaryImageThumbTag,
                  primaryImageLogoTag: item.primaryImageLogoTag,
                  backdropImageTags: item.backdropImageTags,
                  seriesId: item.seriesId,
                  seriesPrimaryImageTag: item.seriesPrimaryImageTag,
                  parentBackdropItemId: item.parentBackdropItemId,
                  parentBackdropImageTags: item.parentBackdropImageTags,
                  parentThumbItemId: item.parentThumbItemId,
                  parentThumbImageTag: item.parentThumbImageTag,
                  imageBlurHashes: item.imageBlurHashes,
                }}
                server={server}
                size="default"
              />
            </div>
            <div className="flex flex-col">
              <div className="capitalize font-medium transition-colors duration-200 group-hover:text-primary">
                {item.name}
              </div>
              {item.seriesName && (
                <div className="text-sm text-neutral-500 transition-colors duration-200 group-hover:text-primary/80">
                  {item.seriesName}
                  {item.parentIndexNumber &&
                    item.indexNumber &&
                    ` • S${item.parentIndexNumber}E${item.indexNumber}`}
                </div>
              )}
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: "item.type",
      header: () => <div className="text-left">Type</div>,
      cell: ({ row }) => {
        const type = row.original.item.type;
        return (
          <Badge variant="outline" className="text-xs">
            {type}
          </Badge>
        );
      },
    },
    {
      accessorKey: "item.productionYear",
      header: () => {
        return (
          <Button variant="ghost" onClick={() => handleSortChange("releaseDate")}>
            Year
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const year = row.original.item.productionYear;
        return <div className="font-medium">{year || "-"}</div>;
      },
    },
    {
      accessorKey: "item.communityRating",
      header: () => <div className="text-left">Rating</div>,
      cell: ({ row }) => {
        const rating = row.original.item.communityRating;
        if (!rating) return <div className="text-muted-foreground">-</div>;
        return (
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
            </svg>
            <span className="font-medium">{rating.toFixed(1)}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "addedAt",
      header: () => {
        return (
          <Button variant="ghost" onClick={() => handleSortChange("dateAdded")}>
            Date Added
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const dateValue = row.original.addedAt;
        if (!dateValue) {
          return <div>No Date</div>;
        }

        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) {
          return <div>Invalid Date</div>;
        }

        return <div>{formatLocalDate(date, "d MMM yyyy, HH:mm")}</div>;
      },
    },
    ...(isOwner
      ? [
          {
            id: "actions",
            header: () => <div className="text-right">Actions</div>,
            cell: ({ row }) => {
              const watchlistItem = row.original;
              const [removing, setRemoving] = useState(false);

              const handleRemove = async (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                setRemoving(true);
                await handleRemoveItem(watchlistItem.item.id);
                setRemoving(false);
              };

              return (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRemove}
                    disabled={removing}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              );
            },
          } as ColumnDef<WatchlistItemWithDetails>,
        ]
      : []),
  ];

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = usePersistantState<
    VisibilityState
  >(`watchlist-items-column-visibility-${watchlist.id}`, {});

  const filteredData = React.useMemo(() => {
    let filtered = items;

    if (currentType && currentType !== "all") {
      filtered = filtered.filter((i) => i.item.type === currentType);
    }

    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      filtered = filtered.filter(
        (watchlistItem) =>
          watchlistItem.item.name.toLowerCase().includes(searchLower) ||
          watchlistItem.item.seriesName?.toLowerCase().includes(searchLower),
      );
    }

    return filtered;
  }, [items, currentType, debouncedSearch]);

  const sortedData = React.useMemo(() => {
    const sortOrder = currentSort || watchlist.defaultSortOrder;
    const sorted = [...filteredData];

    switch (sortOrder) {
      case "name":
        sorted.sort((a, b) =>
          a.item.name.localeCompare(b.item.name, undefined, {
            sensitivity: "base",
          }),
        );
        break;
      case "dateAdded":
        sorted.sort((a, b) => {
          const aDate = a.addedAt ? new Date(a.addedAt).getTime() : 0;
          const bDate = b.addedAt ? new Date(b.addedAt).getTime() : 0;
          return bDate - aDate;
        });
        break;
      case "releaseDate":
        sorted.sort((a, b) => {
          const aYear = a.item.premiereDate
            ? new Date(a.item.premiereDate).getTime()
            : 0;
          const bYear = b.item.premiereDate
            ? new Date(b.item.premiereDate).getTime()
            : 0;
          return bYear - aYear;
        });
        break;
      case "custom":
      default:
        sorted.sort((a, b) => a.position - b.position);
        break;
    }

    return sorted;
  }, [filteredData, currentSort, watchlist.defaultSortOrder]);

  const pageSize = 20;
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedData = sortedData.slice(startIndex, endIndex);

  const table = useReactTable({
    data: paginatedData,
    columns,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      columnFilters,
      columnVisibility,
    },
    manualPagination: false,
    pageCount: totalPages,
  });

  const itemTypes = [...new Set(watchlist.items.map((i) => i.item.type))];

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-muted-foreground">
          <Film className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No items yet</p>
          <p className="text-sm">
            Add items from the library to start building your watchlist
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex items-center gap-3">
          {!watchlist.allowedItemType && itemTypes.length > 1 && (
            <Select value={currentType ?? "all"} onValueChange={handleTypeChange}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {itemTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select
            value={currentSort ?? watchlist.defaultSortOrder}
            onValueChange={handleSortChange}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Custom Order</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="dateAdded">Date Added</SelectItem>
              <SelectItem value="releaseDate">Release Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <Input
            placeholder="Search items..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="max-w-sm"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-auto">
                Columns <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between space-x-2 py-4">
        <div>
          <p className="text-sm text-neutral-500">
            {startIndex + 1} - {Math.min(endIndex, sortedData.length)} of{" "}
            {sortedData.length} results.
          </p>
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1 || isLoading}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || isLoading}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
