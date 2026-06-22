"use client";

import { useEffect } from "react";
import { postBeacon, postInteractions, type ClickPayload } from "@/lib/api/client";

/** Сколько кликов копим за визит максимум — зеркалит серверный `max-batch` (анти-абуз). */
const MAX_CLICKS = 50;

/**
 * JS-бикон аналитики (PRD §5.11) — cookieless, без третьих сторон. Шлёт на визит:
 * - **load:** `fetch(keepalive)` при монтировании (краулеры без JS сюда не доходят — фильтр ботов);
 * - **dwell:** на `visibilitychange→hidden`/`pagehide` — `navigator.sendBeacon` с временем на
 *   странице (надёжнее при выгрузке), тем же `visitId` (сервер коррелирует с load-строкой);
 * - **клики (B2):** копит клики по тайлам борда (`[data-tile-id]`) с долей внутри плитки (0..1)
 *   и шлёт их **одним батчем** на уходе — потайловая хитмапа, стабильная через все вьюпорты.
 *
 * Куки не ставит; сырой IP и хэш считает сервер. Ничего не рендерит.
 */
export function AnalyticsBeacon() {
  useEffect(() => {
    const path = window.location.pathname;
    // /admin* — приватный инструментарий владельца, не посетители: не трекаем вовсе
    // (иначе клики владельца мусорят в аналитике и хитмапе). Публичная страница одна — `/`.
    if (path.startsWith("/admin")) return;
    const visitId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startedAt = performance.now();
    let sent = false;
    const clicks: ClickPayload[] = [];

    postBeacon({ visitId, path, referrer: document.referrer || undefined });

    // Клик: находим ближайший тайл-предок и считаем долю точки внутри его bounding box.
    // Координаты — относительные (0..1), а не экранные пиксели: адаптивный bento ломал бы
    // сырые px, а доля внутри тайла стабильна на любом вьюпорте/волне (PRD §5.11 B2).
    const onClick = (e: MouseEvent) => {
      if (clicks.length >= MAX_CLICKS) return;
      const target = e.target as Element | null;
      const tile = target?.closest<HTMLElement>("[data-tile-id]");
      const viewportW = window.innerWidth;
      if (tile) {
        const r = tile.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        clicks.push({
          tileId: tile.dataset.tileId ?? null,
          offsetXPct: Math.min(1, Math.max(0, x)),
          offsetYPct: Math.min(1, Math.max(0, y)),
          viewportW,
        });
      }
    };

    const flush = () => {
      if (sent || document.visibilityState !== "hidden") return;
      sent = true;
      const dwellMs = Math.round(performance.now() - startedAt);
      const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
      const body = JSON.stringify({ visitId, path, dwellMs });
      // sendBeacon переживает выгрузку вкладки; тип Blob держим application/json под @Consumes.
      navigator.sendBeacon?.(
        `${base}/api/analytics/beacon`,
        new Blob([body], { type: "application/json" }),
      );
      postInteractions({ visitId, path, clicks });
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  return null;
}
