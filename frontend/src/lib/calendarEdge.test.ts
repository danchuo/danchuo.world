import { describe, expect, it } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { datesInRange, weekWindowAround } from "./date";
import { FIELD_ROWS, splitFieldWindow } from "./calendarEdge";

/**
 * The board's window for the field edition: two past weeks and the current one, plus a week of
 * margin each side. It never runs ahead — the future week lives only in the margin.
 */
function window(today: string): DaySummary[] {
  const { from, to } = weekWindowAround(today, 3, 1);
  return datesInRange(from, to).map((date) => ({ date }) as DaySummary);
}

const dates = (days: readonly { date: string }[]) => days.map((d) => d.date);
const at = (w: ReturnType<typeof splitFieldWindow>, date: string) =>
  w.grid.find((p) => p.day.date === date);

describe("splitFieldWindow", () => {
  it("a window without a month seam: a week to the edge, three to the grid, a week to the tail", () => {
    // June 2026 begins on a Monday — there is no month break inside the window.
    const w = splitFieldWindow(window("2026-06-18"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(dates(w.before)).toEqual(datesInRange("2026-05-25", "2026-05-31"));
    expect(dates(w.grid.map((p) => p.day))).toEqual(datesInRange("2026-06-01", "2026-06-21"));
    expect(dates(w.after)).toEqual(datesInRange("2026-06-22", "2026-06-28"));
    expect(w.rows).toBe(3);
  });

  it("a day carries its own grid coordinates", () => {
    const w = splitFieldWindow(window("2026-06-18"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(at(w, "2026-06-01")).toMatchObject({ row: 0, col: 0 });
    expect(at(w, "2026-06-21")).toMatchObject({ row: 2, col: 6 });
  });

  it("a month wrap does not grow the grid: still three rows", () => {
    // 1 September 2026 is a Tuesday and the break adds a row. The top one becomes surplus.
    const w = splitFieldWindow(window("2026-09-15"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(w.rows).toBe(3);
    expect(at(w, "2026-09-01")).toMatchObject({ row: 0, col: 1 });
    expect(at(w, "2026-09-20")).toMatchObject({ row: 2, col: 6 });
    // 31 August stayed past the top edge — it is one step back.
    expect(at(w, "2026-08-31")).toBeUndefined();
  });

  it("the edge is the row that will come in with the next step, not a calendar week", () => {
    // The month break gave 31 August a row of its own. Answering with the week 24..30 would promise
    // the wrong thing: a step back brings the 31st, which is shown NOWHERE right now.
    const w = splitFieldWindow(window("2026-09-15"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(dates(w.before)).toEqual(["2026-08-31"]);
  });

  it("a step back brings into the grid exactly what stood at the edge", () => {
    const home = splitFieldWindow(window("2026-09-15"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    const back = splitFieldWindow(window("2026-09-08"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    const topRow = back.grid.filter((p) => p.row === 0).map((p) => p.day.date);
    expect(topRow).toEqual(dates(home.before));
    // And in its new place the strip shows the next row, not the same one again.
    expect(dates(back.before)).toEqual(datesInRange("2026-08-24", "2026-08-30"));
  });

  it("without a month seam the row is a whole week", () => {
    const w = splitFieldWindow(window("2026-06-18"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(dates(w.before)).toHaveLength(7);
  });

  it("a clipped month label moves into the first day's cell", () => {
    // September's name stood in the empty tail of the top row, and that row is gone: a month
    // cannot stay unnamed, so its own cell names it, as when it begins on a Monday.
    const w = splitFieldWindow(window("2026-09-15"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(w.marks).toEqual([]);
    expect(w.inline).toContain("2026-09-01");
  });

  it("a surviving mark stays the piece's mark", () => {
    // One step back from the previous case: the row with 31 August is now the grid's top one, and
    // its empty tail carries the month's name again.
    const w = splitFieldWindow(window("2026-09-08"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(at(w, "2026-08-31")).toMatchObject({ row: 0, col: 0 });
    expect(w.marks).toEqual([{ date: "2026-09-01", row: 0, from: 1, to: 7 }]);
    expect(w.inline).not.toContain("2026-09-01");
  });

  it("at genesis rows are NOT cut: a cut row would become unreachable", () => {
    // There is no margin back and nowhere to step, so a hidden row would disappear entirely.
    const w = splitFieldWindow(window("2026-09-15"), { edges: true, canGoBack: false, maxRows: FIELD_ROWS });
    expect(w.before).toEqual([]);
    expect(w.rows).toBe(5);
    expect(at(w, "2026-08-24")).toMatchObject({ row: 0, col: 0 });
  });

  it("the tail week is ALWAYS cut — otherwise the grid's height would wander", () => {
    // At home there is no step forward, but the future week must still stay out of the grid:
    // whether to draw it is the component's call, and the grid must remain three rows.
    const w = splitFieldWindow(window("2026-06-18"), { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(w.after).toHaveLength(7);
    expect(w.grid).toHaveLength(21);
  });

  it("a short window gives the edge nothing", () => {
    const days = datesInRange("2026-06-08", "2026-06-21").map((date) => ({ date }) as DaySummary);
    const w = splitFieldWindow(days, { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(w.before).toEqual([]);
    expect(w.grid).toHaveLength(7);
    expect(w.after).toHaveLength(7);
  });

  it("without edges the whole window goes to the grid", () => {
    // The board did not widen the window ⇒ there is nothing to trim: a margin cannot show days
    // that do not exist, and a trimmed row would be unreachable.
    const w = splitFieldWindow(window("2026-09-15"), { edges: false, canGoBack: true, maxRows: FIELD_ROWS });
    expect(w.before).toEqual([]);
    expect(w.after).toEqual([]);
    expect(w.grid).toHaveLength(35);
  });

  it("an empty window does not break the slicing", () => {
    const w = splitFieldWindow([], { edges: true, canGoBack: true, maxRows: FIELD_ROWS });
    expect(w).toEqual({ before: [], grid: [], after: [], marks: [], inline: [], rows: 0 });
  });
});
