/**
 * Calendar window paging, as pure functions: the window is built from an anchor, not from
 * today — moving the anchor is the only way to reach weeks outside it. PRD §5.3
 */

import { addDays, monthOf } from "./date";

/** Paging step: one click brings exactly one new grid row into the window. */
const DAYS_IN_WEEK = 7;

/**
 * New anchor after shifting by [weeks] weeks (negative goes back). Never moves past [today]:
 * home must equal today exactly, or the back button and the step ladder drift apart.
 */
export function shiftAnchor(anchor: string, today: string, weeks: number): string {
  const next = addDays(anchor, weeks * DAYS_IN_WEEK);
  return next > today ? today : next;
}

/**
 * Anchor placed ON a day: the window is built around that day's week, so the day lands in the
 * grid however many rows a month break eats. Stepping back one week gives no such guarantee.
 * Clamped to [today] like [shiftAnchor]. PRD §5.2
 */
export function anchorOnDay(date: string, today: string): string {
  return date > today ? today : date;
}

/**
 * Whether anything is left to page back to. The signal is the backend answer, not config:
 * `DaysResource.range` clamps `from` to genesis, so a first day later than requested means
 * genesis sits inside the window — the frontend never needs the genesis date itself.
 */
export function hasEarlierWeeks(days: readonly { date: string }[], from: string): boolean {
  return days.length > 0 && days[0].date <= from;
}

/** Horizontal boundary run: a row plus the half-open column range `[from, to)`, 0-based. */
export interface MonthEdgeRow {
  row: number;
  from: number;
  to: number;
}

/** Vertical boundary mark: the cell along whose left edge it runs. */
export interface MonthEdgeCol {
  row: number;
  col: number;
}

/**
 * Month boundary steps for the window grid, emitted as segments rather than per-cell marks.
 * Both the segment form and which joins get marked at all: DESIGN §5.
 */
export function monthEdges(
  days: readonly { date: string }[],
  pad: number,
  currentMonth: string,
): { rows: MonthEdgeRow[]; cols: MonthEdgeCol[] } {
  const rows: MonthEdgeRow[] = [];
  const cols: MonthEdgeCol[] = [];
  let run: MonthEdgeRow | null = null;

  for (let i = 0; i < days.length; i++) {
    const row = Math.floor((pad + i) / 7);
    const col = (pad + i) % 7;
    const month = monthOf(days[i].date);

    // Only a month starting BEFORE the current one is marked; the run breaks here. DESIGN §5
    if (month >= currentMonth) {
      run = null;
      continue;
    }

    const above = i >= 7 ? days[i - 7] : undefined;
    if (above && monthOf(above.date) !== month) {
      // Extend the run only while it stays on this row and is flush with this column.
      if (run && run.row === row && run.to === col) run.to = col + 1;
      else {
        run = { row, from: col, to: col + 1 };
        rows.push(run);
      }
    } else {
      run = null;
    }

    const left = col > 0 ? days[i - 1] : undefined;
    if (left && monthOf(left.date) !== month) cols.push({ row, col });
  }

  return { rows, cols };
}
