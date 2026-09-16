"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { readCache, writeCache } from "@/lib/api/cache";

type Phase = "loading" | "error" | "loaded";

interface TileState<T> {
  phase: Phase;
  data: T | null;
  stale: boolean;
  /**
   * The network has answered, success or failure, so what is shown will not change by itself. A
   * cached copy shows before that, which lets a tile that would rather have one calm frame than an
   * instant copy wait for it — fresh data on success, the copy on failure, but once either way.
   */
  settled: boolean;
}

type TileAction<T> =
  | { type: "seeded"; data: T } // cached copy shown while revalidating
  | { type: "loading" }
  | { type: "resolved"; data: T }
  | { type: "failed"; hasCopy: boolean }; // keep the shown copy instead of flipping to error

function tileReducer<T>(state: TileState<T>, action: TileAction<T>): TileState<T> {
  switch (action.type) {
    case "seeded":
      return { phase: "loaded", data: action.data, stale: true, settled: false };
    case "loading":
      return { ...state, phase: "loading", settled: false };
    case "resolved":
      return { phase: "loaded", data: action.data, stale: false, settled: true };
    case "failed":
      return { ...state, phase: action.hasCopy ? "loaded" : "error", settled: true };
  }
}

/**
 * The shared data-loading seam for a tile: fetches on mount with an `AbortController` and returns
 * phase, data and `retry`. Emptiness is the tile's own call. `cacheKey` turns on
 * stale-while-revalidate, so a failed request keeps the last good copy instead of blanking. §7
 */
export function useTileData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  cacheKey?: string,
): {
  phase: Phase;
  data: T | null;
  stale: boolean;
  settled: boolean;
  retry: () => void;
} {
  // Phase/data/stale always change together — one reducer transition instead of three setStates.
  const [state, dispatch] = useReducer(tileReducer<T>, {
    phase: "loading",
    data: null,
    stale: false,
    settled: false,
  });
  const [nonce, setNonce] = useState(0);

  // The fetcher arrives as an arrow from the tile's render, so it is wrapped in a callback stable
  // per nonce: a retry restarts the effect, an ordinary re-render of the tile does not.
  const run = useCallback((signal: AbortSignal) => fetcher(signal), [nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctrl = new AbortController();

    // Seeded from the cache synchronously inside the effect (client-only, so no hydration
    // mismatch): the copy shows instantly, with no flash of a loader, while we revalidate.
    const cached = cacheKey ? readCache<T>(cacheKey) : null;
    if (cached !== null) dispatch({ type: "seeded", data: cached });
    else dispatch({ type: "loading" });

    run(ctrl.signal)
      .then((d) => {
        if (ctrl.signal.aborted) return;
        dispatch({ type: "resolved", data: d });
        if (cacheKey) writeCache(cacheKey, d);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        // With a copy (our own or cached) we keep it shown rather than blanking it into an error.
        dispatch({ type: "failed", hasCopy: cached !== null });
      });
    return () => ctrl.abort();
  }, [run, cacheKey]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, retry };
}
