import { describe, expect, it } from "vitest";
import {
  addDays,
  datesInRange,
  dayOfMonth,
  mskToday,
  startOfWeek,
  weekWindowAround,
  weekdayMondayIndex,
  weekdayShortRu,
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

  it("startOfWeek — понедельник недели, в которую попадает дата", () => {
    expect(startOfWeek("2026-06-18")).toBe("2026-06-15"); // четверг → понедельник той же недели
    expect(startOfWeek("2026-06-15")).toBe("2026-06-15"); // сам понедельник — на месте
    expect(startOfWeek("2026-06-21")).toBe("2026-06-15"); // воскресенье принадлежит ТОЙ ЖЕ неделе
  });

  it("weekWindowAround режет окно по целым неделям пн→вс", () => {
    // 18 июня 2026 — четверг, её понедельник 15-е: две прошлые недели + эта + следующая
    expect(weekWindowAround("2026-06-18", 2, 1)).toEqual({ from: "2026-06-01", to: "2026-06-28" });
  });

  it("weekWindowAround не зависит от дня недели внутри недели", () => {
    const monday = weekWindowAround("2026-06-15", 2, 1);
    expect(weekWindowAround("2026-06-18", 2, 1)).toEqual(monday); // четверг
    expect(weekWindowAround("2026-06-21", 2, 1)).toEqual(monday); // воскресенье
  });

  it("окно weekWindowAround — целое число недель, от понедельника до воскресенья", () => {
    const { from, to } = weekWindowAround("2026-06-18", 2, 1);
    const days = datesInRange(from, to);
    expect(days).toHaveLength(28); // 4 недели
    expect(weekdayMondayIndex(from)).toBe(0); // понедельник
    expect(weekdayMondayIndex(to)).toBe(6); // воскресенье
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
