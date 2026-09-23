"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
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
      // The same state object lets React skip the render: a remount's first frame already has it.
      if (state.settled && !state.stale && state.data === action.data) return state;
      return { phase: "loaded", data: action.data, stale: false, settled: true };
    case "failed":
      return { ...state, phase: action.hasCopy ? "loaded" : "error", settled: true };
  }
}

/** How long an answer serves a remount without asking again: a wave swap remounts the board. §7 */
const ANSWER_FRESH_MS = 30_000;

/** Answers by `cacheKey`: in flight (shared by every tile on the key) or settled with its time. */
const answers = new Map<string, { promise: Promise<unknown>; at: number | null; data?: unknown }>();

/** Test isolation only: module state outlives a test's render tree. */
export function forgetTileAnswers(): void {
  answers.clear();
}

function freshAnswer<T>(key: string | undefined): { data: T } | null {
  const hit = key ? answers.get(key) : undefined;
  if (!hit || hit.at === null || Date.now() - hit.at > ANSWER_FRESH_MS) return null;
  return { data: hit.data as T };
}

/**
 * One request per key however many tiles ask; it is never aborted by one of them, so an unmount
 * mid-flight hands the answer to the next mount instead of paying for it twice.
 */
function shareRequest<T>(key: string, fetcher: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const pending = answers.get(key);
  if (pending && pending.at === null) return pending.promise as Promise<T>;
  const entry: { promise: Promise<unknown>; at: number | null; data?: unknown } = {
    promise: Promise.resolve(),
    at: null,
  };
  const promise = fetcher(new AbortController().signal).then(
    (data) => {
      if (answers.get(key) === entry) Object.assign(entry, { at: Date.now(), data });
      return data;
    },
    (error: unknown) => {
      if (answers.get(key) === entry) answers.delete(key);
      throw error;
    },
  );
  entry.promise = promise;
  answers.set(key, entry);
  return promise;
}

/**
 * A tile's data seam: phase, data and `retry`; emptiness is the tile's own call. `cacheKey`
 * IDENTIFIES THE REQUEST (change it and the tile asks again) and turns on stale-while-revalidate,
 * request sharing and a fresh answer in the FIRST render of a remount. DESIGN §7
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
  const [state, dispatch] = useReducer(tileReducer<T>, cacheKey, (key): TileState<T> => {
    const fresh = freshAnswer<T>(key);
    return fresh
      ? { phase: "loaded", data: fresh.data, stale: false, settled: true }
      : { phase: "loading", data: null, stale: false, settled: false };
  });
  const [nonce, setNonce] = useState(0);

  // The fetcher arrives as a fresh arrow from every render, so the effect cannot depend on it and
  // reads the latest through a ref. What restarts the request is its KEY, never an idle re-render.
  const latest = useRef(fetcher);
  latest.current = fetcher;

  useEffect(() => {
    const ctrl = new AbortController();

    // A fresh answer already sits in the state (initial render) or goes there now (key change);
    // retry is the one path that always reaches the network.
    const fresh = nonce === 0 ? freshAnswer<T>(cacheKey) : null;
    if (fresh) {
      dispatch({ type: "resolved", data: fresh.data });
      return;
    }
    if (cacheKey && nonce > 0) answers.delete(cacheKey);

    // Seeded from the cache synchronously inside the effect (client-only, so no hydration
    // mismatch): the copy shows instantly, with no flash of a loader, while we revalidate.
    const cached = cacheKey ? readCache<T>(cacheKey) : null;
    if (cached !== null) dispatch({ type: "seeded", data: cached });
    else dispatch({ type: "loading" });

    const request = cacheKey ? shareRequest(cacheKey, latest.current) : latest.current(ctrl.signal);
    request
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
  }, [cacheKey, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, retry };
}
