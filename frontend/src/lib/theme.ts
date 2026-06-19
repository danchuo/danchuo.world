/**
 * Темы/волны (PRD §5.9, DESIGN §10): токены живут в БД (JSONB), фронт инжектит их в `:root`.
 *
 * Два пути:
 * - **SSR-инжект (без вспышки):** `fetchActiveThemeTokens` тянет активную волну на сервере,
 *   `serializeTokensToCss` превращает её в `:root{…}`; layout кладёт это `<style>` в `<head>`.
 *   Сбой ⇒ `null` ⇒ остаёмся на дефолтах `globals.css` (graceful degradation).
 * - **Клиентский своп (переключатель):** `applyThemeTokens` пишет токены в `:root` без
 *   перезагрузки — смена отображаемой волны (DESIGN §2.6) без правок компонентов.
 *
 * Ключи токенов хранятся без префикса `--` (его добавляем здесь). Шрифты в токенах не лежат —
 * их подставляет `next/font`, поэтому `--font-*` не трогаем.
 */

import { cache } from "react";
import type { WaveLayout } from "./layout";
import type { ThemeView } from "./api/types";

/** `{ "bg-page": "#faf1eb" }` → `:root{--bg-page:#faf1eb;…}` (одна строка, для `<style>`). */
export function serializeTokensToCss(tokens: Record<string, string>): string {
  const body = Object.entries(tokens)
    .map(([k, v]) => `--${k}:${v};`)
    .join("");
  return `:root{${body}}`;
}

/**
 * Активная волна для SSR (токены + layout). Возвращает `null` при любой ошибке (бэк недоступен,
 * нет активной волны) — фронт остаётся на дефолтах (`globals.css` + `layout.ts`). `no-store`:
 * берём свежей при рендере (смена активной волны видна без ребилда). `cache()` дедуплицирует
 * вызов в пределах одного запроса — root-layout (токены) и page (layout) бьют эндпоинт один раз.
 */
export const fetchActiveTheme = cache(async (): Promise<ThemeView | null> => {
  const base = serverApiBase();
  try {
    const res = await fetch(`${base}/api/theme/active`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ThemeView;
  } catch {
    return null;
  }
});

/** Токены активной волны для SSR-инжекта в `:root` (см. [fetchActiveTheme]). */
export async function fetchActiveThemeTokens(): Promise<Record<string, string> | null> {
  return (await fetchActiveTheme())?.tokens ?? null;
}

/** Layout активной волны для SSR (см. [fetchActiveTheme]); `null` ⇒ дефолт `layout.ts`. */
export async function fetchActiveThemeLayout(): Promise<WaveLayout | null> {
  return (await fetchActiveTheme())?.layout ?? null;
}

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
