import { describe, expect, it } from "vitest";
import {
  addDays,
  datesInRange,
  dayOfMonth,
  mskToday,
  weekdayShortRu,
  windowAround,
} from "./date";

describe("date (канон MSK)", () => {
  it("mskToday отдаёт MSK-дату независимо от зоны посетителя", () => {
    // 2026-06-18 23:30 UTC = 2026-06-19 02:30 MSK → в MSK уже следующий день.
    expect(mskToday(new Date("2026-06-18T23:30:00Z"))).toBe("2026-06-19");
    // 2026-06-18 10:00 UTC = 13:00 MSK → тот же день.
    expect(mskToday(new Date("2026-06-18T10:00:00Z"))).toBe("2026-06-18");
  });

  it("addDays считает через границу месяца без дрейфа зоны", () => {
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("windowAround даёт окно ±radius", () => {
    expect(windowAround("2026-06-18", 15)).toEqual({ from: "2026-06-03", to: "2026-07-03" });
  });

  it("datesInRange непрерывен и включает оба конца", () => {
    const range = datesInRange("2026-06-03", "2026-07-03");
    expect(range).toHaveLength(31);
    expect(range[0]).toBe("2026-06-03");
    expect(range.at(-1)).toBe("2026-07-03");
  });

  it("dayOfMonth и weekdayShortRu", () => {
    expect(dayOfMonth("2026-06-18")).toBe(18);
    expect(weekdayShortRu("2026-06-18")).toMatch(/чт/i); // 18 июня 2026 — четверг
  });

  it("отвергает не-ISO вход", () => {
    expect(() => addDays("18.06.2026", 1)).toThrow();
  });
});
