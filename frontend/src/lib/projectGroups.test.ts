import { describe, expect, it } from "vitest";
import { projectYearRows } from "./projectGroups";

/** A minimal record: the layout cares only about the range's edge. */
const p = (title: string, endYear: number | null) => ({ title, endYear });

describe("projectYearRows", () => {
  it("a finished project is marked with the year it ended", () => {
    expect(projectYearRows([p("proxemics", 2024)], 2026)).toEqual([
      { project: p("proxemics", 2024), year: 2024, startsYear: true, indexInYear: 0, yearSize: 1 },
    ]);
  });

  /**
   * An open end means "ongoing", so the last activity is now. Otherwise a live project would land
   * in the group of its START year and sit at the bottom of the list under the finished ones.
   */
  it("an open end → the current year", () => {
    expect(projectYearRows([p("danchuo.world", null)], 2026)).toEqual([
      { project: p("danchuo.world", null), year: 2026, startsYear: true, indexInYear: 0, yearSize: 1 },
    ]);
  });

  /**
   * The year prints ONCE per group, in its first row's margin; the rest are empty. That is the
   * suppression of repetition: the left column separates groups without repeating anything.
   */
  it("the year is printed only on the first row of its group", () => {
    const rows = projectYearRows([p("a", null), p("b", 2026), p("c", 2024), p("d", 2024)], 2026);
    expect(rows.map((r) => [r.project.title, r.year, r.startsYear])).toEqual([
      ["a", 2026, true],
      ["b", 2026, false],
      ["c", 2024, true],
      ["d", 2024, false],
    ]);
  });

  /**
   * Each year has its own tree, the trunk growing down from the year (DESIGN §7.8), so a row
   * carries ITS place within the year rather than in the whole list — or the elbow would close a
   * foreign group.
   */
  it("a row knows its place within the year, not in the overall list", () => {
    const rows = projectYearRows([p("a", null), p("b", 2026), p("c", 2024)], 2026);
    expect(rows.map((r) => [r.indexInYear, r.yearSize])).toEqual([
      [0, 2],
      [1, 2],
      [0, 1],
    ]);
  });

  /**
   * Rows of one year stand together even when the sort order separated them: otherwise the year
   * would have to print twice, and it separates a group rather than labelling a row.
   */
  it("a project split by the ordering moves to its own, the year is not repeated", () => {
    const rows = projectYearRows([p("a", 2026), p("b", 2024), p("c", 2026)], 2026);
    expect(rows.map((r) => [r.project.title, r.year, r.startsYear])).toEqual([
      ["a", 2026, true],
      ["c", 2026, false],
      ["b", 2024, true],
    ]);
  });

  it("an empty list → not a single row", () => {
    expect(projectYearRows([], 2026)).toEqual([]);
  });
});
