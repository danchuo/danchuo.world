"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readCache, writeCache } from "@/lib/api/cache";
import { getDays } from "@/lib/api/client";
import type { DaySummary } from "@/lib/api/types";

type Status = "loading" | "error" | "loaded";

/**
 * Loads a range of days under two rules an ordinary tile does not need. A CHANGE OF RANGE DOES NOT
 * BLANK WHAT IS SHOWN — the old range stays with its own tag until the new one arrives — and an
 * answer for an abandoned range is ignored, since a reader pages faster than the network. §7
 */
export function useDayRange<T>(
  from: string,
  to: string,
  tag: T,
): {
  days: DaySummary[];
  status: Status;
  /** The SHOWN range's tag: while a new one travels it lags the requested one, by design. */
  shownTag: T;
  /** The shown range's start — genesis is checked against it, not against the requested one. */
  shownFrom: string;
  retry: () => void;
} {
  const [days, setDays] = useState<DaySummary[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [shownTag, setShownTag] = useState<T>(tag);
  const [shownFrom, setShownFrom] = useState(from);

  // Ranges opened this session: an accumulator of answers, not displayed state.
  const memo = useRef<Record<string, DaySummary[]>>({});
  // Whether anything is shown: the "blank it or keep it" decision is taken inside the load.
  const shown = useRef(false);
  // The range still awaited; a late answer for any other one is discarded.
  const awaiting = useRef<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const show = useCallback((rows: DaySummary[], nextTag: T, nextFrom: string) => {
    shown.current = true;
    setDays(rows);
    setShownTag(nextTag);
    setShownFrom(nextFrom);
    setStatus("loaded");
  }, []);

  useEffect(() => {
    const key = `days:${from}:${to}`;
    awaiting.current = key;

    // A range already opened this session comes from memory with no network: moving back and forth
    // must not ask for the same thing twice (past days' summaries do not change within a session).
    const seen = memo.current[key];
    if (seen) {
      show(seen, tag, from);
      return;
    }

    // A copy from a previous session is shown at once but revalidated over the network: the cache
    // is cross-session and survives an F5 through the soft rate limit on public GETs.
    const copy = readCache<DaySummary[]>(key);
    if (copy) show(copy, tag, from);
    else if (!shown.current) setStatus("loading"); // nothing to show — an honest loader

    getDays(from, to)
      .then((rows) => {
        if (awaiting.current !== key) return;
        memo.current[key] = rows;
        show(rows, tag, from);
        writeCache(key, rows);
      })
      .catch(() => {
        if (awaiting.current !== key || copy) return;
        setStatus("error");
      });
  }, [from, to, tag, nonce, show]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { days, status, shownTag, shownFrom, retry };
}
