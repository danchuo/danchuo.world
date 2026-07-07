/**
 * Темы/волны (PRD §5.9, DESIGN §10): токены живут в БД (JSONB), фронт инжектит их в `:root`.
 *
 * Два пути:
 * - **SSR-инжект (без вспышки):** `fetchActiveTheme` тянет активную волну на сервере,
 *   `serializeTokensToCss` превращает её токены в `:root{…}`; layout кладёт это `<style>` в `<head>`.
 *   Сбой ⇒ `null` ⇒ остаёмся на дефолтах `globals.css` (graceful degradation).
 * - **Клиентский своп (переключатель):** `applyThemeTokens` пишет токены в `:root` без
 *   перезагрузки — смена отображаемой волны (DESIGN §2.6) без правок компонентов.
 *
 * Ключи токенов хранятся без префикса `--` (его добавляем здесь). Шрифты в токенах не лежат —
 * их подставляет `next/font`, поэтому `--font-*` не трогаем.
 */

import { cache } from "react";
import type { ThemeView } from "./api/types";

/**
 * Next data-cache TTL for SSR theme fetches. Themes change rarely (a wave release / owner's
 * switch), while every page view costs 1-2 backend GETs from the single frontend-server IP —
 * without caching, a burst of reloads trips the backend rate limiter and SSR degrades to the
 * default wave (no `data-wave`, no pressed swatch).
 */
const THEME_REVALIDATE_SECONDS = 30;

/** `{ "bg-page": "#faf1eb" }` → `:root{--bg-page:#faf1eb;…}` (одна строка, для `<style>`). */
export function serializeTokensToCss(tokens: Record<string, string>): string {
  const body = Object.entries(tokens)
    .map(([k, v]) => `--${k}:${v};`)
    .join("");
  return `:root{${body}}`;
}

/**
 * Активная волна для SSR (токены + layout). Возвращает `null` при любой ошибке (бэк недоступен,
 * нет активной волны) — фронт остаётся на дефолтах (`globals.css` + `layout.ts`). `revalidate`:
 * Next data cache serves reloads without hitting the backend each time — an F5 storm no longer
 * drains the backend rate-limit bucket (which used to degrade SSR to the default wave); an
 * owner's active-wave change still shows up within THEME_REVALIDATE_SECONDS without a rebuild.
 * `cache()` дедуплицирует вызов в пределах одного запроса — root-layout (токены) и page
 * (layout) бьют эндпоинт один раз.
 */
export const fetchActiveTheme = cache(async (): Promise<ThemeView | null> => {
  const base = serverApiBase();
  try {
    const res = await fetch(`${base}/api/theme/active`, {
      headers: { Accept: "application/json" },
      next: { revalidate: THEME_REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as ThemeView;
  } catch {
    return null;
  }
});

/**
 * All released waves for SSR (`GET /api/themes`); `null` on failure. Needed to render the
 * visitor-picked wave (cookie) even when it is not the active one. `cache()` — one call
 * per request (layout + page).
 */
const fetchThemes = cache(async (): Promise<ThemeView[] | null> => {
  const base = serverApiBase();
  try {
    const res = await fetch(`${base}/api/themes`, {
      headers: { Accept: "application/json" },
      next: { revalidate: THEME_REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as ThemeView[];
  } catch {
    return null;
  }
});

/**
 * Wave to render for this request: the visitor's preference from the cookie (see
 * `waveCookie.ts`) on top of the owner's active wave. The key is checked against the list of
 * released waves — an unknown/stale cookie is silently ignored (falls back to active).
 * `cache()` dedupes by identical key between root layout and page.
 */
export const fetchDisplayTheme = cache(async (preferredKey: string | null): Promise<ThemeView | null> => {
  if (preferredKey) {
    const preferred = (await fetchThemes())?.find((t) => t.key === preferredKey);
    if (preferred) return preferred;
  }
  return fetchActiveTheme();
});

/** Клиентский своп: пишет токены волны в `:root` (переключатель волн, DESIGN §2.6). */
export function applyThemeTokens(tokens: Record<string, string>): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) {
    root.style.setProperty(`--${k}`, v);
  }
}

/**
 * Абсолютная база API для server-side fetch. Внутри Docker фронт-сервер ходит к бэку по
 * внутреннему адресу (`API_INTERNAL_URL`); иначе — публичная база; иначе — локальный дев.
 */
function serverApiBase(): string {
  return (
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:8080"
  ).replace(/\/$/, "");
}
