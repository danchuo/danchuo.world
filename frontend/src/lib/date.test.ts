import { describe, expect, it } from "vitest";
import {
  addDays,
  datesInRange,
  dayOfMonth,
  monthNameRu,
  mskClock,
  mskToday,
  startOfWeek,
  weekWindowAround,
  weekdayMondayIndex,
} from "./date";

describe("date (MSK canon)", () => {
  it("mskToday returns the MSK date regardless of the visitor's zone", () => {
    // 2026-06-18 23:30 UTC = 2026-06-19 02:30 MSK → in MSK it is already the next day.
    expect(mskToday(new Date("2026-06-18T23:30:00Z"))).toBe("2026-06-19");
    // 2026-06-18 10:00 UTC = 13:00 MSK → the same day.
    expect(mskToday(new Date("2026-06-18T10:00:00Z"))).toBe("2026-06-18");
  });

  it("mskClock returns the time of day in MSK, not in the viewer's zone", () => {
    // 06:12 UTC is 09:12 MSK: a sitting labelled morning stays morning from anywhere.
    expect(mskClock("2026-08-13T06:12:00Z")).toBe("09:12");
    // Across UTC midnight: 21:40 UTC = 00:40 MSK the next day.
    expect(mskClock("2026-08-13T21:40:00Z")).toBe("00:40");
  });

  it("addDays counts across a month boundary without zone drift", () => {
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("startOfWeek — the Monday of the week the date falls in", () => {
    expect(startOfWeek("2026-06-18")).toBe("2026-06-15"); // Thursday → the Monday of that week
    expect(startOfWeek("2026-06-15")).toBe("2026-06-15"); // a Monday stays put
    expect(startOfWeek("2026-06-21")).toBe("2026-06-15"); // Sunday belongs to the SAME week
  });

  it("weekWindowAround cuts the window into whole Mon→Sun weeks", () => {
    // 18 June 2026 is a Thursday, its Monday the 15th: two past weeks plus this one plus the next
    expect(weekWindowAround("2026-06-18", 2, 1)).toEqual({ from: "2026-06-01", to: "2026-06-28" });
  });

  it("weekWindowAround does not depend on the weekday within the week", () => {
    const monday = weekWindowAround("2026-06-15", 2, 1);
    expect(weekWindowAround("2026-06-18", 2, 1)).toEqual(monday); // a Thursday
    expect(weekWindowAround("2026-06-21", 2, 1)).toEqual(monday); // a Sunday
  });

  it("the weekWindowAround window is a whole number of weeks, Monday to Sunday", () => {
    const { from, to } = weekWindowAround("2026-06-18", 2, 1);
    const days = datesInRange(from, to);
    expect(days).toHaveLength(28); // 4 weeks
    expect(weekdayMondayIndex(from)).toBe(0); // Monday
    expect(weekdayMondayIndex(to)).toBe(6); // Sunday
  });

  it("datesInRange is continuous and includes both ends", () => {
    const range = datesInRange("2026-06-03", "2026-07-03");
    expect(range).toHaveLength(31);
    expect(range[0]).toBe("2026-06-03");
    expect(range.at(-1)).toBe("2026-07-03");
  });

  it("dayOfMonth", () => {
    expect(dayOfMonth("2026-06-18")).toBe(18);
  });

  it("monthNameRu adds the year only for another year", () => {
    expect(monthNameRu("2026-06-18", "2026-08-04")).toBe("июнь");
    expect(monthNameRu("2025-12-10", "2026-08-04")).toBe("декабрь 2025");
  });

  it("rejects non-ISO input", () => {
    expect(() => addDays("18.06.2026", 1)).toThrow();
  });
});
