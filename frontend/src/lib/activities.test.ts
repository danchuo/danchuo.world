import { describe, expect, it } from "vitest";
import type { DayView } from "./api/types";
import { dayActivities } from "./activities";

const day = (over: Partial<DayView> = {}): DayView =>
  ({ date: "2026-09-23", title: null, hasData: true, health: {}, discipline: [], ...over }) as DayView;

describe("dayActivities", () => {
  it("names each activity in the backend's order", () => {
    expect(dayActivities(day({ activities: ["bouldering", "gym", "pushups"] }))).toEqual([
      { key: "bouldering", label: "болдеринг" },
      { key: "gym", label: "зал" },
      { key: "pushups", label: "отжимания" },
    ]);
  });

  it("a key the board does not know yet still shows, under its own name", () => {
    expect(dayActivities(day({ activities: ["surfing"] }))).toEqual([{ key: "surfing", label: "surfing" }]);
  });

  it("no activities from an older backend is an empty row, not an error", () => {
    expect(dayActivities(day())).toEqual([]);
  });
});
