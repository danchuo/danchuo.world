"use client";

import { useEffect } from "react";
import { postBeacon, postInteractions, type ClickPayload } from "@/lib/api/client";

/** Most clicks kept per visit — mirrors the server's `max-batch` (anti-abuse). */
const MAX_CLICKS = 50;

/**
 * The cookieless analytics beacon: a load ping on mount, a dwell ping via `sendBeacon` on the way
 * out, and tile clicks batched into that same departure. It sets no cookies, leaves the hash to
 * the server and renders nothing. PRD §5.11
 */
export function AnalyticsBeacon() {
  useEffect(() => {
    const path = window.location.pathname;
    // /admin* is the owner's private tooling, not visitors: not tracked at all, or the owner's
    // clicks would litter the analytics and the heatmap. There is one public page, `/`.
    if (path.startsWith("/admin")) return;
    const visitId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startedAt = performance.now();
    let sent = false;
    const clicks: ClickPayload[] = [];

    postBeacon({ visitId, path, referrer: document.referrer || undefined });

    // Click: find the nearest tile ancestor and take the point's fraction inside its box.
    // Coordinates are relative (0..1), never screen pixels — an adaptive bento would break raw
    // px, while a fraction inside a tile holds on any viewport or wave. PRD §5.11
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
      // sendBeacon survives tab unload; the Blob type stays application/json for @Consumes.
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
