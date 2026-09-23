import { describe, expect, it } from "vitest";
import { breakdownLabel, formatCount, formatDuration, formatVital, periodWindow, PERIODS, vitalGrade } from "./analyticsFormat";

describe("formatDuration", () => {
  it("reads as time on the page, not as a number of milliseconds", () => {
    expect(formatDuration(107_000)).toBe("1:47");
    expect(formatDuration(9_000)).toBe("0:09");
    expect(formatDuration(3_600_000)).toBe("60:00");
  });

  it("no data — a dash, not zero: zero here would mean falling asleep instantly", () => {
    expect(formatDuration(null)).toBe("—");
  });
});

describe("formatCount", () => {
  it("digits are grouped so the KPI reads at a glance", () => {
    expect(formatCount(1284)).toBe("1 284");
    expect(formatCount(42)).toBe("42");
  });
});

describe("breakdownLabel", () => {
  it("each breakdown's empty key is called by its own word", () => {
    expect(breakdownLabel("source", null)).toBe("прямые заходы");
    expect(breakdownLabel("utmCampaign", null)).toBe("без метки");
    expect(breakdownLabel("viewport", null)).toBe("не измерен");
    expect(breakdownLabel("wave", null)).toBe("не собиралось");
  });

  it("a non-empty key is returned as is", () => {
    expect(breakdownLabel("source", "t.me")).toBe("t.me");
    expect(breakdownLabel("device", "DESKTOP")).toBe("DESKTOP");
  });
});

describe("periodWindow", () => {
  it("the window includes today and exactly N days back", () => {
    expect(periodWindow(7, "2026-09-21")).toEqual({ from: "2026-09-15", to: "2026-09-21" });
  });

  it("crosses a month boundary", () => {
    expect(periodWindow(30, "2026-03-05")).toEqual({ from: "2026-02-04", to: "2026-03-05" });
  });

  it("each switcher period has a length", () => {
    expect(PERIODS.map((p) => p.days)).toEqual([7, 30, 90, 365]);
  });
});

describe("Web Vitals", () => {
  it("reads milliseconds as seconds past one, CLS as the bare score", () => {
    expect(formatVital("lcpMs", 2345.4)).toBe("2.35 с");
    expect(formatVital("inpMs", 96)).toBe("96 мс");
    expect(formatVital("cls", 0.0431)).toBe("0.04");
    expect(formatVital("ttfbMs", null)).toBe("—");
  });

  it("grades by Google's thresholds, the boundary itself still good", () => {
    expect(vitalGrade("lcpMs", 2500)).toBe("good");
    expect(vitalGrade("lcpMs", 2501)).toBe("needs-improvement");
    expect(vitalGrade("inpMs", 501)).toBe("poor");
    expect(vitalGrade("cls", 0.1)).toBe("good");
    expect(vitalGrade("cls", 0.3)).toBe("poor");
    expect(vitalGrade("fcpMs", null)).toBeNull();
  });
});
