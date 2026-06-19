"use client";

import { useCallback, useEffect, useState } from "react";

type Phase = "loading" | "error" | "loaded";

/**
 * Общий шов загрузки данных тайла (DESIGN §7 — независимые per-tile состояния, без общего
 * спиннера). Тянет источник на маунте с `AbortController`, отдаёт фазу + данные + `retry`.
 * Пустоту (`empty`) решает сам тайл по содержимому — здесь только loading/error/loaded.
 */
export function useTileData<T>(fetcher: (signal: AbortSignal) => Promise<T>): {
  phase: Phase;
  data: T | null;
  retry: () => void;
} {
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<T | null>(null);
  const [nonce, setNonce] = useState(0);

  // fetcher приходит как стрелка из рендера тайла — оборачиваем в стабильный колбэк по nonce,
  // чтобы повтор (retry) перезапускал эффект, но обычный ре-рендер тайла — нет.
  const run = useCallback((signal: AbortSignal) => fetcher(signal), [nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctrl = new AbortController();
    setPhase("loading");
    run(ctrl.signal)
      .then((d) => {
        if (ctrl.signal.aborted) return;
        setData(d);
        setPhase("loaded");
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setPhase("error");
      });
    return () => ctrl.abort();
  }, [run]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { phase, data, retry };
}
