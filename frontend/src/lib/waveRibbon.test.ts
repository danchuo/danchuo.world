import { describe, expect, it } from "vitest";
import type { DaySummary } from "./api/types";
import { buildRibbon, ribbonDay } from "./waveRibbon";

// Step digits are grouped with a NON-BREAKING space, the way `formatSteps` prints them, and the
// ribbon must match the figures on the tiles.

/** A full day: everything the ribbon can show. */
function day(over: Partial<DaySummary> = {}): DaySummary {
  return {
    date: "2026-08-24",
    title: "тихий понедельник",
    hasData: true,
    steps: 8340,
    sleepMinutes: 432,
    contributions: 3,
    monsterDrunk: null,
    ...over,
  };
}

describe("ribbonDay", () => {
  it("assembles the day with dots: date, day name, metrics", () => {
    expect(ribbonDay(day())).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · git +3",
    );
  });

  it("a day without a name simply does not carry one — no hole is left in the ribbon", () => {
    expect(ribbonDay(day({ title: null }))).toBe(
      "пн 24.08 · сон 7ч 12м · шаги 8 340 · git +3",
    );
  });

  it("null ≠ 0: an uncollected metric drops out, an honest zero stays", () => {
    expect(ribbonDay(day({ steps: null, contributions: 0, sleepMinutes: null }))).toBe(
      "пн 24.08 · тихий понедельник · git +0",
    );
  });

  it("a day with nothing to say has no place in the ribbon — a bare date is not a line", () => {
    expect(
      ribbonDay(
        day({
          title: null,
          steps: null,
          sleepMinutes: null,
          contributions: null,
          hasData: false,
        }),
      ),
    ).toBeNull();
  });
});

/** The ribbon's "today" anchor: days after it have not been lived yet. */
const TODAY = "2026-08-26";

describe("buildRibbon", () => {
  it("joins days with the same separator as the fields within a day — the ribbon is continuous", () => {
    const ribbon = buildRibbon(
      [
        day(),
      day({ date: "2026-08-25", title: "день длинных созвонов", steps: 12907, sleepMinutes: 408, contributions: 5 }),
    ], TODAY);
    expect(ribbon).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · git +3 · " +
        "вт 25.08 · день длинных созвонов · сон 6ч 48м · шаги 12 907 · git +5",
    );
  });

  it("empty days drop out instead of leaving double dots", () => {
    const empty = day({
      date: "2026-08-26",
      title: null,
      steps: null,
      sleepMinutes: null,
      contributions: null,
      hasData: false,
    });
    expect(buildRibbon([day(), empty], TODAY)).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · git +3",
    );
  });

  it("a window without a single lived day is an empty ribbon, not a line of separators", () => {
    expect(buildRibbon([], TODAY)).toBe("");
  });

  it("future days do not enter the ribbon — the canvas is about days lived, not the calendar", () => {
    const future = day({
      date: "2026-08-27",
      title: null,
      steps: null,
      sleepMinutes: null,
      // Contributions for a future day arrive as zero (the day was collected, none happened), and
      // without the "today" anchor such a day would print as lived.
      contributions: 0,
    });
    expect(buildRibbon([day(), future], TODAY)).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · git +3",
    );
  });

  it("today is a lived day: it stays in the ribbon", () => {
    const today = day({ date: TODAY, title: "сегодня" });
    expect(buildRibbon([today], TODAY)).toContain("ср 26.08 · сегодня");
  });
});
