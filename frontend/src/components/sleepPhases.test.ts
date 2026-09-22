import { describe, expect, it } from "vitest";
import { sleepPhases } from "./sleepPhases";

describe("sleepPhases (§7.7)", () => {
  it("counts shares of the rem+deep+light sum (awake is not included)", () => {
    const p = sleepPhases({ rem: 92, deep: 68, light: 301, awake: 12 });
    expect(p).not.toBeNull();
    expect(p!.map((x) => [x.key, x.minutes, x.pct])).toEqual([
      ["rem", 92, 20],
      ["deep", 68, 15],
      ["light", 301, 65],
    ]);
  });

  it("a missing phase counts as zero instead of crashing the calculation", () => {
    const p = sleepPhases({ rem: null, deep: 60, light: 60, awake: null });
    expect(p!.find((x) => x.key === "rem")!.pct).toBe(0);
    expect(p!.find((x) => x.key === "deep")!.pct).toBe(50);
  });

  it("the phase labels are the same as in Health: REM / DEEP / CORE", () => {
    // A reader has nothing to compare phases against but Apple's app, and there is no "light"
    // there: the longest phase is called Core. The key stays `light` (HealthKit's `asleepCore`),
    // while the board's label is CORE.
    const p = sleepPhases({ rem: 90, deep: 60, light: 150, awake: 10 });
    expect(p!.map((x) => x.label)).toEqual(["REM", "DEEP", "CORE"]);
  });

  it("no phases (null) or empty ⇒ null (degrading to a single duration)", () => {
    expect(sleepPhases(null)).toBeNull();
    expect(sleepPhases(undefined)).toBeNull();
    expect(sleepPhases({ rem: 0, deep: 0, light: 0, awake: 30 })).toBeNull();
  });
});

describe("sleepPhases — each phase has its own hint", () => {
  const stages = { rem: 90, deep: 60, light: 150, awake: 10 };

  it("all three phases have a hint and each its own", () => {
    // The hint answers "what is this phase anyway" — three identical texts would answer it worse
    // than none at all.
    const hints = sleepPhases(stages)!.map((p) => p.hint);
    expect(hints.every((h) => h.length > 0)).toBe(true);
    expect(new Set(hints).size).toBe(3);
  });

  it("the hint is short — on the board it is one thought, not a paragraph", () => {
    for (const p of sleepPhases(stages)!) expect(p.hint.length).toBeLessThanOrEqual(70);
  });

  it("the hint does not repeat the caption itself — the minutes and share already stand beside it", () => {
    for (const p of sleepPhases(stages)!) expect(p.hint).not.toContain(p.label);
  });
});
