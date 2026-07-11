"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { readCache, writeCache } from "@/lib/api/cache";

type Phase = "loading" | "error" | "loaded";

interface TileState<T> {
  phase: Phase;
  data: T | null;
  stale: boolean;
}

type TileAction<T> =
  | { type: "seeded"; data: T } // cached copy shown while revalidating
  | { type: "loading" }
  | { type: "resolved"; data: T }
  | { type: "failed"; hasCopy: boolean }; // keep the shown copy instead of flipping to error

function tileReducer<T>(state: TileState<T>, action: TileAction<T>): TileState<T> {
  switch (action.type) {
    case "seeded":
      return { phase: "loaded", data: action.data, stale: true };
    case "loading":
      return { ...state, phase: "loading" };
    case "resolved":
      return { phase: "loaded", data: action.data, stale: false };
    case "failed":
      return { ...state, phase: action.hasCopy ? "loaded" : "error" };
  }
}

/**
 * Общий шов загрузки данных тайла (DESIGN §7 — независимые per-tile состояния, без общего
 * спиннера). Тянет источник на маунте с `AbortController`, отдаёт фазу + данные + `retry`.
 * Пустоту (`empty`) решает сам тайл по содержимому — здесь только loading/error/loaded.
 *
 * `cacheKey` включает stale-while-revalidate: на маунте тайл сразу показывает последнюю удачную
 * копию из `localStorage` (если есть), а сетевой ответ её обновляет. Если запрос не прошёл
 * (например, мягкий рейтлимит после серии F5), копия остаётся на экране (`stale`), а не обнуляется
 * в ошибку — борд не «мигает пустым». Без копии поведение прежнее: loading → error с «повторить».
 */
export function useTileData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  cacheKey?: string,
): {
  phase: Phase;
  data: T | null;
  stale: boolean;
  retry: () => void;
} {
  // Phase/data/stale always change together — one reducer transition instead of three setStates.
  const [state, dispatch] = useReducer(tileReducer<T>, { phase: "loading", data: null, stale: false });
  const [nonce, setNonce] = useState(0);

  // fetcher приходит как стрелка из рендера тайла — оборачиваем в стабильный колбэк по nonce,
  // чтобы повтор (retry) перезапускал эффект, но обычный ре-рендер тайла — нет.
  const run = useCallback((signal: AbortSignal) => fetcher(signal), [nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctrl = new AbortController();

    // Сидируем из кэша синхронно в эффекте (клиент-only — без рассинхрона гидрации): копия
    // видна мгновенно, без вспышки лоадера, пока ревалидируем по сети.
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
        // Есть копия (своя или из кэша) — оставляем её показанной, а не обнуляем в ошибку.
        dispatch({ type: "failed", hasCopy: cached !== null });
      });
    return () => ctrl.abort();
  }, [run, cacheKey]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, retry };
}
