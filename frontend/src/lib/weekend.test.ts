import { describe, expect, it } from "vitest";
import { isWeekend } from "./weekend";

describe("isWeekend", () => {
  it("суббота и воскресенье — выходные", () => {
    expect(isWeekend("2026-06-20")).toBe(true); // Sat
    expect(isWeekend("2026-06-21")).toBe(true); // Sun
  });

  it("будни — не выходные", () => {
    expect(isWeekend("2026-06-19")).toBe(false); // Fri
    expect(isWeekend("2026-06-22")).toBe(false); // Mon
    expect(isWeekend("2026-06-18")).toBe(false); // Thu
  });

  it("день недели берётся по дате MSK, а не по локальной tz (UTC-парс)", () => {
    // MSK midnight on 2026-06-20 is still 2026-06-19 in UTC; parsing as a UTC date keeps a
    // Saturday a Saturday.
    expect(isWeekend("2026-06-20")).toBe(true);
  });
});
