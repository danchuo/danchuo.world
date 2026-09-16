/**
 * The ribbon of lived days — PRIME's backdrop. The wave draws the board's own DATA as its
 * background: the calendar window laid out as one line. Only the pure transformation lives here.
 * The `null != 0` convention holds — an uncollected metric drops out, an honest zero stays. §10.2
 */

import type { DaySummary } from "./api/types";
import { weekdayShortRu } from "./date";
import { formatSleepShort, formatSteps } from "./format";

/** The separator both inside a day and between days: the ribbon must read as one line. */
const DOT = " · ";

/**
 * One day in the ribbon. The contributions channel is labelled `git` rather than a Russian noun:
 * its neighbours are named by their subject, and the candidate words name nothing.
 * Discipline fractions are absent: on the canvas they read as a second voice of data.
 */
export function ribbonDay(summary: DaySummary): string | null {
  const parts: string[] = [];

  if (summary.title) parts.push(summary.title);
  if (summary.sleepMinutes !== null) parts.push(`сон ${formatSleepShort(summary.sleepMinutes)}`);
  if (summary.steps !== null) parts.push(`шаги ${formatSteps(summary.steps)}`);
  if (summary.contributions !== null) parts.push(`git +${summary.contributions}`);

  if (parts.length === 0) return null;
  return [`${weekdayShortRu(summary.date)} ${dayMonth(summary.date)}`, ...parts].join(DOT);
}

/**
 * The calendar window as one line; empty days drop out leaving no double separators. `today` is the
 * anchor and DAYS AFTER IT NEVER ENTER: the window reaches a week ahead, a future day's
 * contributions arrive as an honest zero, and an unlived day would print beside lived ones.
 */
export function buildRibbon(summaries: DaySummary[], today: string): string {
  return summaries
    .filter((s) => s.date <= today)
    .map(ribbonDay)
    .filter((line): line is string => line !== null)
    .join(DOT);
}

/** `2026-08-25` → `25.08`: the year is redundant in the ribbon, the calendar is always nearby. */
function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}
