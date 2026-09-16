/**
 * Themes and waves: tokens live in the DB and the frontend injects them into `:root`. Two paths —
 * an SSR inject that avoids any flash, and a client swap for the switcher. Token keys are stored
 * WITHOUT the `--` prefix, and fonts are never among them: `next/font` supplies those. DESIGN §10
 */

import { cache } from "react";
import type { ThemeView } from "./api/types";

/**
 * Next data-cache TTL for SSR theme fetches. Themes change rarely, while every page view costs one
 * or two backend GETs from the single frontend-server IP — uncached, a burst of reloads trips the
 * rate limiter and SSR degrades to the default wave.
 */
const THEME_REVALIDATE_SECONDS = 30;

/** `{ "bg-page": "#faf1eb" }` → `:root{--bg-page:#faf1eb;…}`, one line, for a `<style>` tag. */
export function serializeTokensToCss(tokens: Record<string, string>): string {
  const body = Object.entries(tokens)
    .map(([k, v]) => `--${k}:${v};`)
    .join("");
  return `:root{${body}}`;
}

/**
 * The active wave for SSR, tokens and layout. Any failure returns `null` and the frontend stays on
 * its defaults. The data cache keeps an F5 storm from draining the backend's bucket, while
 * `cache()` dedupes the call within one request so layout and page hit the endpoint once.
 */
export const fetchActiveTheme = cache(
  async (): Promise<ThemeView | null> => fetchBackendJson<ThemeView>("/api/theme/active"),
);

/**
 * All released waves for SSR (`GET /api/themes`); `null` on failure. Needed to render the
 * visitor-picked wave (cookie) even when it is not the active one. `cache()` — one call
 * per request (layout + page).
 */
const fetchThemes = cache(
  async (): Promise<ThemeView[] | null> => fetchBackendJson<ThemeView[]>("/api/themes"),
);

/**
 * The wave to render for this request: the visitor's cookie preference on top of the owner's active
 * wave. The key is checked against the released list, so an unknown or stale cookie is silently
 * ignored. `cache()` dedupes by identical key between root layout and page.
 */
export const fetchDisplayTheme = cache(async (preferredKey: string | null): Promise<ThemeView | null> => {
  if (preferredKey) {
    const preferred = (await fetchThemes())?.find((t) => t.key === preferredKey);
    if (preferred) return preferred;
  }
  return fetchActiveTheme();
});

/** Client-side swap: writes a wave's tokens into `:root` (the wave switcher, DESIGN §2.6). */
export function applyThemeTokens(tokens: Record<string, string>): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) {
    root.style.setProperty(`--${k}`, v);
  }
}

/**
 * Marks a request as coming from inside the compose network, which keeps the backend from counting
 * it against a rate-limit bucket — SSR arrives with no `X-Forwarded-For` and would otherwise share
 * one bucket for every visitor. The edge STRIPS this header from public traffic; rename both.
 */
export const INTERNAL_HEADER = "X-Danchuo-Internal";

/**
 * Shared seam for an SSR request to the backend: the trusted header, Next's data cache and soft
 * degradation. Any slip (backend down, non-200, broken JSON) becomes `null` rather than an exception,
 * so the board stays on the defaults of `globals.css` and `layout.ts` instead of falling over.
 */
export async function fetchBackendJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${serverApiBase()}${path}`, {
      headers: { Accept: "application/json", [INTERNAL_HEADER]: "1" },
      next: { revalidate: THEME_REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Absolute API base for a server-side fetch. Inside Docker the frontend server reaches the backend by
 * its internal address (`API_INTERNAL_URL`); failing that the public base; failing that local dev.
 */
function serverApiBase(): string {
  return (
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:8080"
  ).replace(/\/$/, "");
}
