import { describe, expect, it } from "vitest";
import { breakdownLabel, formatCount, formatDuration, periodWindow, PERIODS } from "./analyticsFormat";

describe("formatDuration", () => {
  it("читается как время на странице, а не как число миллисекунд", () => {
    expect(formatDuration(107_000)).toBe("1:47");
    expect(formatDuration(9_000)).toBe("0:09");
    expect(formatDuration(3_600_000)).toBe("60:00");
  });

  it("нет данных — прочерк, а не ноль: ноль здесь означал бы мгновенный уход", () => {
    expect(formatDuration(null)).toBe("—");
  });
});

describe("formatCount", () => {
  it("разряды разделяются, чтобы KPI читался с одного взгляда", () => {
    expect(formatCount(1284)).toBe("1 284");
    expect(formatCount(42)).toBe("42");
  });
});

describe("breakdownLabel", () => {
  it("пустой ключ каждого разреза называется своим словом", () => {
    expect(breakdownLabel("source", null)).toBe("прямые заходы");
    expect(breakdownLabel("utmCampaign", null)).toBe("без метки");
    expect(breakdownLabel("viewport", null)).toBe("не измерен");
    expect(breakdownLabel("wave", null)).toBe("не собиралось");
  });

  it("непустой ключ отдаётся как есть", () => {
    expect(breakdownLabel("source", "t.me")).toBe("t.me");
    expect(breakdownLabel("device", "DESKTOP")).toBe("DESKTOP");
  });
});

describe("periodWindow", () => {
  it("окно включает сегодня и ровно N дней назад", () => {
    expect(periodWindow(7, "2026-09-21")).toEqual({ from: "2026-09-15", to: "2026-09-21" });
  });

  it("переходит через границу месяца", () => {
    expect(periodWindow(30, "2026-03-05")).toEqual({ from: "2026-02-04", to: "2026-03-05" });
  });

  it("у каждого периода переключателя есть длина", () => {
    expect(PERIODS.map((p) => p.days)).toEqual([7, 30, 90, 365]);
  });
});
