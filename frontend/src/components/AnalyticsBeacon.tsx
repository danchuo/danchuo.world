"use client";

import { useEffect } from "react";
import { postBeacon, postInteractions, type ClickPayload } from "@/lib/api/client";

/** Clicks kept per flush — mirrors the server's `max-batch`; CLICK_CEILING bounds the visit. */
const MAX_CLICKS_PER_FLUSH = 50;
const CLICK_CEILING = 200;

/**
 * The cookieless analytics beacon: a load ping on mount, then a flush on every departure
 * carrying foreground time, scroll depth and the clicks not sent yet. It sets no cookies,
 * leaves the visitor hash to the server and renders nothing. PRD §5.11
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
    const params = new URLSearchParams(window.location.search);
    const clicks: ClickPayload[] = [];
    let sentClicks = 0;
    // Foreground time only, GA4's rule: a backgrounded tab is not a reader. PRD §5.11
    let visibleSince = performance.now();
    let foregroundMs = 0;
    let maxScrollPct = 0;
    let scrollQueued = false;

    postBeacon({
      visitId,
      path,
      referrer: document.referrer || undefined,
      utmSource: params.get("utm_source") ?? undefined,
      utmMedium: params.get("utm_medium") ?? undefined,
      utmCampaign: params.get("utm_campaign") ?? undefined,
      waveKey: document.documentElement.dataset.wave,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
    });

    // Click: the nearest tile ancestor and the point's fraction inside its box. Coordinates are
    // relative, never screen pixels — an adaptive bento would break raw px, while a fraction
    // holds on any viewport or wave. A click on the ground is measured against the viewport.
    const onClick = (e: MouseEvent) => {
      if (clicks.length >= CLICK_CEILING) return;
      const tile = (e.target as Element | null)?.closest<HTMLElement>("[data-tile-id]");
      const box = tile?.getBoundingClientRect();
      const viewportW = window.innerWidth;
      if (tile && box && box.width > 0 && box.height > 0) {
        clicks.push({
          tileId: tile.dataset.tileId ?? null,
          offsetXPct: clamp((e.clientX - box.left) / box.width),
          offsetYPct: clamp((e.clientY - box.top) / box.height),
          viewportW,
        });
      } else if (!tile) {
        clicks.push({
          tileId: null,
          offsetXPct: clamp(e.clientX / viewportW),
          offsetYPct: clamp(e.clientY / window.innerHeight),
          viewportW,
        });
      }
    };

    const onScroll = () => {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const reached = scrollable > 0 ? ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100 : 100;
        maxScrollPct = Math.max(maxScrollPct, Math.round(clamp(reached / 100) * 100));
      });
    };

    // Every departure flushes; the visit may come back and leave again, and both halves count.
    const flush = () => {
      const at = performance.now();
      foregroundMs += at - visibleSince;
      visibleSince = at;

      postBeacon({ visitId, path, dwellMs: Math.round(foregroundMs), scrollPct: maxScrollPct });

      const pending = clicks.slice(sentClicks, sentClicks + MAX_CLICKS_PER_FLUSH);
      if (pending.length > 0) {
        sentClicks += pending.length;
        postInteractions({ visitId, path, clicks: pending });
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else visibleSince = performance.now();
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  return null;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
