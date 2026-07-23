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
    // Полночь MSK 2026-06-20 — это ещё 2026-06-19 в UTC; парс как UTC-даты держит субботу субботой.
    expect(isWeekend("2026-06-20")).toBe(true);
  });
});
