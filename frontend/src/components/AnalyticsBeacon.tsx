"use client";

import { useEffect } from "react";
import { postBeacon } from "@/lib/api/client";

/**
 * JS-бикон аналитики (PRD §5.11) — cookieless, без третьих сторон. Шлёт два события на визит:
 * - **load:** `fetch(keepalive)` при монтировании (краулеры без JS сюда не доходят — фильтр ботов);
 * - **dwell:** на `visibilitychange→hidden`/`pagehide` — `navigator.sendBeacon` с временем на
 *   странице (надёжнее при выгрузке), тем же `visitId` (сервер коррелирует с load-строкой).
 *
 * Куки не ставит; сырой IP и хэш считает сервер. Ничего не рендерит.
 */
export function AnalyticsBeacon() {
  useEffect(() => {
    const path = window.location.pathname;
    const visitId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startedAt = performance.now();
    let dwellSent = false;

    postBeacon({ visitId, path, referrer: document.referrer || undefined });

    const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
    const sendDwell = () => {
      if (dwellSent || document.visibilityState !== "hidden") return;
      dwellSent = true;
      const dwellMs = Math.round(performance.now() - startedAt);
      const body = JSON.stringify({ visitId, path, dwellMs });
      // sendBeacon переживает выгрузку вкладки; тип Blob держим application/json под @Consumes.
      navigator.sendBeacon?.(
        `${base}/api/analytics/beacon`,
        new Blob([body], { type: "application/json" }),
      );
    };

    document.addEventListener("visibilitychange", sendDwell);
    window.addEventListener("pagehide", sendDwell);
    return () => {
      document.removeEventListener("visibilitychange", sendDwell);
      window.removeEventListener("pagehide", sendDwell);
    };
  }, []);

  return null;
}
