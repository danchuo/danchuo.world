import type { DaySummary } from "@/lib/api/types";
import { monthRowsLayout, type MonthGap } from "./calendarMonthRows";

/** Split fetched calendar weeks into edges and a height-capped field grid. DESIGN §5.2. */

const DAYS_IN_WEEK = 7;

/** Two past weeks and the current week; future weeks have no data. DESIGN §5.2. */
export const FIELD_ROWS = 3;

/** Day with its grid slot; month breaks make slots noncontiguous. */
export interface PlacedDay {
  day: DaySummary;
  row: number;
  col: number;
}

export interface FieldWindow {
  /** The exact layout row entering on the next backward step; empty at the boundary. */
  before: DaySummary[];
  grid: PlacedDay[];
  /** The week after the grid; the component decides whether to display it. */
  after: DaySummary[];
  /** Month labels in grid-relative gaps. DESIGN §5.2. */
  marks: MonthGap[];
  /** First-of-month cells that carry their own label. */
  inline: string[];
  rows: number;
}

export interface FieldWindowOptions {
  /** Whether extra edge weeks were fetched; without them, retain the entire window. */
  edges: boolean;
  /** Backend-derived backward availability; no dead edge at genesis. PRD §5.3. */
  canGoBack: boolean;
  /** Maximum grid height in rows. */
  maxRows: number;
}

const EMPTY: FieldWindow = { before: [], grid: [], after: [], marks: [], inline: [], rows: 0 };

/** Always remove the trailing week to keep home height stable; trim excess rows only when backward paging can reach them. */
export function splitFieldWindow(
  days: readonly DaySummary[],
  { edges, canGoBack, maxRows }: FieldWindowOptions,
): FieldWindow {
  if (days.length === 0) return EMPTY;

  const tailAt = edges ? Math.max(0, days.length - DAYS_IN_WEEK) : days.length;
  const after = days.slice(tailAt);
  const head = days.slice(0, tailAt);
  if (head.length === 0) return { ...EMPTY, after: [...after] };

  const layout = monthRowsLayout(head);
  const drop = edges && canGoBack ? Math.max(0, layout.rows - maxRows) : 0;

  const grid: PlacedDay[] = [];
  head.forEach((day, i) => {
    const row = Math.floor(layout.slots[i] / DAYS_IN_WEEK) - drop;
    if (row >= 0) grid.push({ day, row, col: layout.slots[i] % DAYS_IN_WEEK });
  });
  if (grid.length === 0) return { ...EMPTY, after: [...after] };

  const shown = new Set(grid.map((p) => p.day.date));
  const marks = layout.marks
    .filter((m) => m.row >= drop)
    .map((m) => ({ ...m, row: m.row - drop }));
  // Restore the first-cell month label when its gap scrolls above the grid.
  const inline = [
    ...layout.inline,
    ...layout.marks.filter((m) => m.row < drop).map((m) => m.date),
  ].filter((date) => shown.has(date));

  return {
    before: edges && canGoBack ? rowAt(head, layout.slots, drop - 1) : [],
    grid,
    after: [...after],
    marks,
    inline,
    rows: layout.rows - drop,
  };
}

/** Return a layout row, not a calendar week: month breaks can split a week and otherwise hide its tail. */
function rowAt(head: readonly DaySummary[], slots: readonly number[], row: number): DaySummary[] {
  if (row < 0) return [];
  return head.filter((_, i) => Math.floor(slots[i] / DAYS_IN_WEEK) === row);
}
