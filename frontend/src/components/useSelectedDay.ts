"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readCache, writeCache } from "@/lib/api/cache";
import { getDay } from "@/lib/api/client";
import type { DayView } from "@/lib/api/types";

type Status = "loading" | "error" | "loaded";

/**
 * The board's day layer: the selected day and its state, stale-while-revalidate with two twists.
 * WHILE A NEW DAY TRAVELS THE PREVIOUS ONE STAYS — `loading` draws a shimmer INSTEAD of content,
 * which collapsed the board's dominant tile. An answer for an abandoned day is ignored. DESIGN §7
 */
export function useSelectedDay(date: string): {
  day: DayView | null;
  status: Status;
  retry: () => void;
} {
  const [day, setDay] = useState<DayView | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  // Loaded days are an accumulator of network answers, not displayed state: kept in a ref so
  // writing to the cache causes no extra render.
  const memo = useRef<Record<string, DayView>>({});
  // The shown day is a ref too: the "blank it or keep it" decision is taken inside the load, and
  // reading it from state would mean rebuilding the load on every arriving day.
  const shown = useRef<DayView | null>(null);
  // The date still awaited; a late answer for any other one is discarded.
  const awaiting = useRef<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const show = useCallback((d: DayView | null, next: Status) => {
    shown.current = d;
    setDay(d);
    setStatus(next);
  }, []);

  useEffect(() => {
    awaiting.current = date;
    // A day already loaded this session comes from memory with no network: paging back and forth
    // through the calendar must not ask for the same day twice.
    const seen = memo.current[date];
    if (seen) {
      show(seen, "loaded");
      return;
    }

    // A copy from a previous session is shown at once but revalidated: it is cross-session and may
    // well be stale (it survives an F5 and the soft rate limit on public GETs).
    const copy = readCache<DayView>(`day:${date}`);
    if (copy) show(copy, "loaded");
    else if (!shown.current) show(null, "loading"); // nothing to show — an honest loader

    getDay(date)
      .then((d) => {
        if (awaiting.current !== date) return;
        memo.current[date] = d;
        show(d, "loaded");
        writeCache(`day:${date}`, d);
      })
      .catch(() => {
        if (awaiting.current !== date || copy) return;
        setStatus("error");
      });
  }, [date, nonce, show]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { day, status, retry };
}
