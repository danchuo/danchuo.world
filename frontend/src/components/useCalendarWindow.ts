"use client";

import { useMemo } from "react";
import type { DaySummary } from "@/lib/api/types";
import { hasEarlierWeeks } from "@/lib/calendarWindow";
import { weekWindowAround } from "@/lib/date";
import { useDayRange } from "./useDayRange";

type Status = "loading" | "error" | "loaded";

/**
 * The calendar's window layer: four weeks around an anchor plus their state. Loading itself is the
 * shared [useDayRange] seam, which holds the "never blank what is shown" rule. What stays here is
 * calendar-only: turning an anchor into week bounds, and stopping at genesis. PRD §5.3
 */
export function useCalendarWindow(
  anchor: string,
  weeksBefore: number,
  weeksAfter: number,
): {
  days: DaySummary[];
  status: Status;
  /** The SHOWN window's reference: while a new one travels it lags the requested one, by design. */
  shownAnchor: string;
  /** Whether there is anything to page back to — by the backend's answer, not a copy of genesis. */
  canGoBack: boolean;
  retry: () => void;
} {
  const { from, to } = useMemo(
    () => weekWindowAround(anchor, weeksBefore, weeksAfter),
    [anchor, weeksBefore, weeksAfter],
  );

  const { days, status, shownTag, shownFrom, retry } = useDayRange(from, to, anchor);

  // While a window travels the arrow stays lit (optimistically): "nothing earlier" is the
  // backend's answer about a loaded window, and mid-flight it would describe the previous one.
  const canGoBack = status === "loaded" ? hasEarlierWeeks(days, shownFrom) : true;

  return { days, status, shownAnchor: shownTag, canGoBack, retry };
}
