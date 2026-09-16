/**
 * Formatting of stats for display. The key convention is NULL IS NOT 0: a missing metric renders
 * as "no data" while a real `0` renders as `0`. Hence the explicit `=== null` checks everywhere —
 * a truthy test would collapse zero into "no data". PRD §5.4, DESIGN §4
 */

export const NO_DATA = "нет данных";

/** Steps: `8 421`; `0` → `0`; `null` → "no data". */
export function formatSteps(steps: number | null): string {
  if (steps === null) return NO_DATA;
  return steps.toLocaleString("ru-RU");
}

/** Sleep as hours and minutes in Russian; `0` becomes `0 min`; `null` becomes "no data". */
export function formatSleep(minutes: number | null): string {
  if (minutes === null) return NO_DATA;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

/** Compact sleep for a narrow column: single-letter units, `0` still shows, `null` is "no data". */
export function formatSleepShort(minutes: number | null): string {
  if (minutes === null) return NO_DATA;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}м`;
  if (m === 0) return `${h}ч`;
  return `${h}ч ${m}м`;
}

/** The steps Y-axis label: `15K`, `7.5K`, `0` (thousands, one decimal). */
export function formatStepsAxis(steps: number): string {
  if (steps === 0) return "0";
  const k = steps / 1000;
  return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
}

/** The sleep Y-axis label: whole hours, rounded, with the hour unit in Russian. */
export function formatSleepAxis(minutes: number): string {
  if (minutes === 0) return "0";
  return `${Math.round(minutes / 60)}ч`;
}

/** The item is closed (for the `--success` highlight, DESIGN §4). */
export function isDisciplineDone(count: number, target: number): boolean {
  return count >= target;
}

/**
 * "N ago" for the freshness lamp (PRD §8). Compact units for a mono tile; under a minute reads as
 * "just now". An invalid ISO gives an empty string and the tile shows nothing.
 */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}
