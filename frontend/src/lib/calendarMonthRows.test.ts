import { describe, expect, it } from "vitest";
import { datesInRange, weekWindowAround } from "./date";
import { monthRowsLayout, type MonthRowsLayout } from "./calendarMonthRows";

type Day = { date: string };

const win = (from: string, to: string): Day[] =>
  datesInRange(from, to).map((date) => ({ date }));

/** A day's position in the grid — more readable than a raw slot number. */
function at(days: Day[], layout: MonthRowsLayout, date: string): { row: number; col: number } {
  const slot = layout.slots[days.findIndex((d) => d.date === date)];
  return { row: Math.floor(slot / 7), col: slot % 7 };
}

describe("monthRowsLayout", () => {
  it("a window without a month seam lays out as ordinary weeks", () => {
    const days = win("2026-06-01", "2026-06-28");
    const l = monthRowsLayout(days);
    expect(l.rows).toBe(4);
    expect(at(days, l, "2026-06-01")).toEqual({ row: 0, col: 0 });
    expect(at(days, l, "2026-06-28")).toEqual({ row: 3, col: 6 });
    expect(l.marks).toEqual([]);
  });

  it("a month starts on a NEW row: the first day moves to the next week", () => {
    // 1 September 2026 is a Tuesday; Monday 31 August stays the last day of its row.
    const days = win("2026-08-24", "2026-09-20");
    const l = monthRowsLayout(days);
    expect(at(days, l, "2026-08-31")).toEqual({ row: 1, col: 0 });
    expect(at(days, l, "2026-09-01")).toEqual({ row: 2, col: 1 });
    // The weekday column does not shift across a break — a Tuesday stays a Tuesday.
    expect(at(days, l, "2026-09-06")).toEqual({ row: 2, col: 6 });
  });

  it("a wrap costs exactly one week of slots — the grid grows by a row", () => {
    const l = monthRowsLayout(win("2026-08-24", "2026-09-20"));
    expect(l.rows).toBe(5);
  });

  it("the month label goes into the LARGER of two empty pieces — down if the head is narrow", () => {
    // The new row's head is one Monday, the previous row's tail six days: the name goes there.
    const l = monthRowsLayout(win("2026-08-24", "2026-09-20"));
    expect(l.marks).toEqual([{ date: "2026-09-01", row: 1, from: 1, to: 7 }]);
  });

  it("…and into the head of the new row when that is wider", () => {
    // 1 May 2026 is a Friday: a head of 4 cells against a tail of 3.
    const l = monthRowsLayout(win("2026-04-20", "2026-05-17"));
    expect(l.marks).toEqual([{ date: "2026-05-01", row: 2, from: 0, to: 4 }]);
  });

  it("a month that already starts a row needs no wrap", () => {
    // 1 June 2026 is a Monday: the new row starts by itself and no cells are left empty.
    const days = win("2026-05-25", "2026-06-21");
    const l = monthRowsLayout(days);
    expect(l.rows).toBe(4);
    expect(at(days, l, "2026-06-01")).toEqual({ row: 1, col: 0 });
    expect(l.marks).toEqual([]);
    // There is no empty space for the name — the first day's own cell names the month.
    expect(l.inline).toEqual(["2026-06-01"]);
  });

  it("the first day at the very start of the window is marked in its cell: the break has nothing to hook onto", () => {
    const l = monthRowsLayout(win("2026-06-01", "2026-06-28"));
    expect(l.inline).toEqual(["2026-06-01"]);
  });

  it("the month name always fits into the selected piece — it is never narrower than four cells", () => {
    // Head and tail add up to exactly a week, so the larger of them is never below four. The
    // invariant is checked across all twelve month edges of the year, one per weekday.
    for (let m = 1; m <= 12; m++) {
      const first = `2026-${String(m).padStart(2, "0")}-01`;
      const { from, to } = weekWindowAround(first, 1, 2);
      const l = monthRowsLayout(win(from, to));
      const mark = l.marks.find((x) => x.date === first);
      if (!mark) continue; // the month began on a Monday — there is no break at all
      expect(mark.to - mark.from).toBeGreaterThanOrEqual(4);
    }
  });

  it("an empty window does not break the layout", () => {
    expect(monthRowsLayout([])).toEqual({ rows: 0, slots: [], marks: [], inline: [] });
  });
});
