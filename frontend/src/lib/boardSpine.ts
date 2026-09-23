import { dayPath, daysPath } from "./api/client";
import { addDays, weekWindowAround } from "./date";
import type { ResolvedLayout } from "./layout";
import { statsWindow } from "./statsWindow";

/**
 * The board's spine windows, shared by the board and by SSR's preload of them: a preload that
 * differs from the request by one byte downloads twice. PRD §5.3, DESIGN §7.10
 */

/** The calendar window as whole weeks around today: two past, the current one and the next. */
const WEEKS_BEFORE = 2;
const WEEKS_AFTER = 1;

/** The "field" edition does not reach forward: a future week held a whole row. DESIGN §5.2 */
const FIELD_WEEKS_AFTER = 0;

/**
 * Depth of the wave's backdrop — the last two weeks, ALWAYS those, wherever the calendar is
 * scrolled: it lies under everything, so one widget's paging must not repaint it. DESIGN §10.2
 */
export const BACKDROP_DAYS = 14;

/** Weeks the calendar loads each side; the field edition's edge (§5.2) adds a real week to both. */
export function calendarWeeks(layout: ResolvedLayout): { before: number; after: number } {
  const field = layout.tiles.calendar.edition === "field";
  const edge = field ? 1 : 0;
  return { before: WEEKS_BEFORE + edge, after: (field ? FIELD_WEEKS_AFTER : WEEKS_AFTER) + edge };
}

/** The paths a freshly opened board asks for first: the day, the calendar, the backdrop, the charts. */
export function spinePaths(layout: ResolvedLayout, today: string): string[] {
  const weeks = calendarWeeks(layout);
  const calendar = weekWindowAround(today, weeks.before, weeks.after);
  const stats = statsWindow(today, today, null);
  const paths = [
    dayPath(today),
    daysPath(calendar.from, calendar.to),
    daysPath(addDays(today, -(BACKDROP_DAYS - 1)), today),
    daysPath(stats.from, stats.to),
  ];
  return [...new Set(paths)];
}
