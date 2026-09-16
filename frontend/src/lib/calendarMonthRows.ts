import { dayOfMonth, weekdayMondayIndex } from "./date";

/** Month starts create row breaks; gaps carry month labels. DESIGN §5.2. */

const DAYS_IN_WEEK = 7;

/** Month label gap: zero-based row and half-open columns [from, to). */
export interface MonthGap {
  /** First day of the incoming month; the label names what follows. */
  date: string;
  row: number;
  from: number;
  to: number;
}

export interface MonthRowsLayout {
  /** Row count including month breaks. */
  rows: number;
  /** Slot for each day: row * 7 + col. */
  slots: number[];
  marks: MonthGap[];
  /** Month starts without a gap are labeled in their own cell. */
  inline: string[];
}

/** Start each month on a new row; its two gaps total seven slots, so the larger gap always has at least four. */
export function monthRowsLayout(days: readonly { date: string }[]): MonthRowsLayout {
  const slots: number[] = [];
  const marks: MonthGap[] = [];
  const inline: string[] = [];
  let row = 0;

  for (let i = 0; i < days.length; i++) {
    const date = days[i].date;
    const col = weekdayMondayIndex(date);
    const first = dayOfMonth(date) === 1;

    if (i === 0) {
      // The first sampled day is a window boundary, not a month break.
      if (first) inline.push(date);
    } else if (col === 0) {
      row += 1;
      // Monday month starts need no inserted gap.
      if (first) inline.push(date);
    } else if (first) {
      row += 1;
      marks.push(gap(date, row, col));
    }

    slots.push(row * DAYS_IN_WEEK + col);
  }

  return { rows: days.length === 0 ? 0 : row + 1, slots, marks, inline };
}

/** Place the label in the wider gap; both gaps precede the new month in reading order. */
function gap(date: string, row: number, col: number): MonthGap {
  const head = col;
  const tail = DAYS_IN_WEEK - col;
  return head >= tail
    ? { date, row, from: 0, to: head }
    : { date, row: row - 1, from: col, to: DAYS_IN_WEEK };
}
