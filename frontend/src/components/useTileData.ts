"use client";

import { useCallback, useEffect, useState } from "react";
import { readCache, writeCache } from "@/lib/api/cache";

type Phase = "loading" | "error" | "loaded";

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
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<T | null>(null);
  const [stale, setStale] = useState(false);
  const [nonce, setNonce] = useState(0);

  // fetcher приходит как стрелка из рендера тайла — оборачиваем в стабильный колбэк по nonce,
  // чтобы повтор (retry) перезапускал эффект, но обычный ре-рендер тайла — нет.
  const run = useCallback((signal: AbortSignal) => fetcher(signal), [nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctrl = new AbortController();

    // Сидируем из кэша синхронно в эффекте (клиент-only — без рассинхрона гидрации): копия
    // видна мгновенно, без вспышки лоадера, пока ревалидируем по сети.
    const cached = cacheKey ? readCache<T>(cacheKey) : null;
    if (cached !== null) {
      setData(cached);
      setStale(true);
      setPhase("loaded");
    } else {
      setPhase("loading");
    }

    run(ctrl.signal)
      .then((d) => {
        if (ctrl.signal.aborted) return;
        setData(d);
        setStale(false);
        setPhase("loaded");
        if (cacheKey) writeCache(cacheKey, d);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        // Есть копия (своя или из кэша) — оставляем её показанной, а не обнуляем в ошибку.
        if (cached !== null) setPhase("loaded");
        else setPhase("error");
      });
    return () => ctrl.abort();
  }, [run, cacheKey]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { phase, data, stale, retry };
}
