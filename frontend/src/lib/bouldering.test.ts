import { describe, expect, it } from "vitest";
import type { DayView } from "./api/types";
import { showsBoulder, withDemoBouldering } from "./bouldering";

const day = (over: Partial<DayView> = {}): DayView =>
  ({ date: "2026-09-23", title: null, hasData: true, health: {}, discipline: [], ...over }) as DayView;

describe("showsBoulder", () => {
  it("the shoe comes out only on a day when there was bouldering", () => {
    expect(showsBoulder(day({ bouldered: true }))).toBe(true);
    expect(showsBoulder(day({ bouldered: false }))).toBe(false);
    expect(showsBoulder(day({ bouldered: null }))).toBe(false);
    expect(showsBoulder(day())).toBe(false);
  });
});

describe("withDemoBouldering", () => {
  it("the demo marks bouldering only today", () => {
    expect(withDemoBouldering(day(), true, "2026-09-23").bouldered).toBe(true);
    expect(withDemoBouldering(day({ date: "2026-09-22" }), true, "2026-09-23").bouldered).toBeUndefined();
  });

  it("without the demo the day arrives as is", () => {
    const d = day();
    expect(withDemoBouldering(d, false, "2026-09-23")).toBe(d);
  });

  it("a real backend answer is not overridden by the demo", () => {
    expect(withDemoBouldering(day({ bouldered: false }), true, "2026-09-23").bouldered).toBe(false);
  });
});
