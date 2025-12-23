"use client";

import { addDays, format, isValid, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useQueryParams } from "@/hooks/useQueryParams";
import { cn } from "@/lib/utils";

const DATE_PARAM_FORMAT = "yyyy-MM-dd";

function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = parseISO(value);
  if (!isValid(parsed)) return undefined;
  return parsed;
}

function formatDateParam(date: Date): string {
  return format(date, DATE_PARAM_FORMAT);
}

function getDefaultRange(): DateRange {
  const to = new Date();
  const from = addDays(to, -7);
  return { from, to };
}

export function WatchtimeDateRangeFilter({
  className,
}: {
  className?: string;
}) {
  const searchParams = useSearchParams();
  const { updateQueryParams, isLoading } = useQueryParams();
  const [open, setOpen] = React.useState(false);

  const disableFutureDays = React.useCallback((date: Date) => {
    return date > new Date();
  }, []);

  const rangeFromUrl = React.useMemo((): DateRange => {
    const from = parseDateParam(searchParams.get("startDate"));
    const to = parseDateParam(searchParams.get("endDate"));

    if (from && to) {
      return { from, to };
    }

    return getDefaultRange();
  }, [searchParams]);

  const [range, setRange] = React.useState<DateRange | undefined>(rangeFromUrl);

  React.useEffect(() => {
    if (!open) {
      setRange(rangeFromUrl);
    }
  }, [rangeFromUrl, open]);

  const commitRangeToUrl = React.useCallback(
    (next: DateRange) => {
      if (!next.from || !next.to) return;

      updateQueryParams({
        startDate: formatDateParam(next.from),
        endDate: formatDateParam(next.to),
      });
    },
    [updateQueryParams],
  );

  const handleSelect = React.useCallback((next: DateRange | undefined) => {
    setRange(next);
  }, []);

  const applyRange = () => {
    if (range?.from && range?.to) {
      commitRangeToUrl(range);
      setOpen(false);
    }
  };

  const cancelRange = () => {
    setRange(rangeFromUrl);
    setOpen(false);
  };

  const applyPreset = React.useCallback(
    (days: number) => {
      const to = new Date();
      const from = addDays(to, -days);
      const next = { from, to } satisfies DateRange;
      setRange(next);
      commitRangeToUrl(next);
      setOpen(false);
    },
    [commitRangeToUrl],
  );

  const apply7d = React.useCallback(() => applyPreset(7), [applyPreset]);
  const apply30d = React.useCallback(() => applyPreset(30), [applyPreset]);
  const apply90d = React.useCallback(() => applyPreset(90), [applyPreset]);

  const label = React.useMemo(() => {
    if (!rangeFromUrl?.from) return "Pick a date range";
    if (!rangeFromUrl.to) return format(rangeFromUrl.from, "MMM dd, yyyy");
    return `${format(rangeFromUrl.from, "MMM dd, yyyy")} – ${format(rangeFromUrl.to, "MMM dd, yyyy")}`;
  }, [rangeFromUrl]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Popover
          open={open}
          onOpenChange={(newOpen) => {
            setOpen(newOpen);
            if (!newOpen) {
              setRange(rangeFromUrl);
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              disabled={isLoading}
              className="justify-start text-left font-normal sm:w-[320px]"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {label}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              captionLayout="dropdown"
              fromYear={2010}
              toYear={new Date().getFullYear()}
              numberOfMonths={2}
              defaultMonth={range?.from}
              selected={range}
              onSelect={handleSelect}
              initialFocus
              disabled={disableFutureDays}
            />
            <div className="flex items-center justify-end gap-2 p-3 border-t">
              <Button variant="ghost" size="sm" onClick={cancelRange}>
                Cancel
              </Button>
              <Button size="sm" onClick={applyRange}>
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex gap-2 sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isLoading}
            onClick={apply7d}
          >
            7d
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isLoading}
            onClick={apply30d}
          >
            30d
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isLoading}
            onClick={apply90d}
          >
            90d
          </Button>
        </div>
      </div>
    </div>
  );
}
