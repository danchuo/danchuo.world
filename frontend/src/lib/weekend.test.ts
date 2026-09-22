import { describe, expect, it } from "vitest";
import { isWeekend } from "./weekend";

describe("isWeekend", () => {
  it("Saturday and Sunday are weekends", () => {
    expect(isWeekend("2026-06-20")).toBe(true); // Sat
    expect(isWeekend("2026-06-21")).toBe(true); // Sun
  });

  it("weekdays are not weekends", () => {
    expect(isWeekend("2026-06-19")).toBe(false); // Fri
    expect(isWeekend("2026-06-22")).toBe(false); // Mon
    expect(isWeekend("2026-06-18")).toBe(false); // Thu
  });

  it("the weekday is taken from the MSK date, not the local tz (UTC parse)", () => {
    // MSK midnight on 2026-06-20 is still 2026-06-19 in UTC; parsing as a UTC date keeps a
    // Saturday a Saturday.
    expect(isWeekend("2026-06-20")).toBe(true);
  });
});
