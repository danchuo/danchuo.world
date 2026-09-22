import { describe, expect, it } from "vitest";
import { moonLightAzimuth, moonLitPath, moonPhase } from "./moonPhase";

// The reference dates are astronomical new and full moons. The tolerance is counted in cycle days:
// the phase is taken at midnight while the event falls on any hour of its day, which already eats
// half of it. A day and a half catches both a wrong reference point and a wrong month length.
const DAY = 1 / 29.530588853;
const TOLERANCE = 1.5 * DAY;

describe("moonPhase", () => {
  it("the new moon of 11 January 2024 — the start of the cycle", () => {
    const phase = moonPhase("2024-01-11")!;
    expect(Math.min(phase.cycle, 1 - phase.cycle)).toBeLessThan(TOLERANCE);
    expect(phase.lit).toBeLessThan(0.02);
  });

  it("the full moon of 25 January 2024 — the middle of the cycle", () => {
    const phase = moonPhase("2024-01-25")!;
    expect(Math.abs(phase.cycle - 0.5)).toBeLessThan(TOLERANCE);
    expect(phase.lit).toBeGreaterThan(0.98);
  });

  it("the first quarter waxes, the last wanes — half a disc in both", () => {
    const first = moonPhase("2024-01-18")!;
    const last = moonPhase("2024-02-02")!;
    expect(Math.abs(first.lit - 0.5)).toBeLessThan(0.1);
    expect(Math.abs(last.lit - 0.5)).toBeLessThan(0.1);
    expect(first.waxing).toBe(true);
    expect(last.waxing).toBe(false);
  });

  it("a broken date — empty, not NaN in the markup", () => {
    expect(moonPhase("нет даты")).toBeNull();
  });
});

describe("moonLitPath", () => {
  it("new moon is a zero-area outline, full moon the whole disc", () => {
    // In both the terminator runs along the very edge (the semi-axis equals the radius), and only
    // the direction of the bulge tells them apart: towards the light a crescent, away a hump.
    expect(moonLitPath(0, 7)).toContain("A 7 7 0 0 0");
    expect(moonLitPath(0.5, 7)).toContain("A 7 7 0 0 1");
  });

  it("a quarter is a straight terminator", () => {
    expect(moonLitPath(0.25, 7)).toContain("A 0 7");
  });

  it("the crescent and the gibbous bulge in opposite directions", () => {
    const crescent = moonLitPath(0.1, 7).split("A").pop()!;
    const gibbous = moonLitPath(0.4, 7).split("A").pop()!;
    expect(crescent).toContain("0 0 0");
    expect(gibbous).toContain("0 0 1");
  });
});

describe("moonLightAzimuth", () => {
  const PI = Math.PI;

  it("the full moon is lit from behind the viewer, the new moon from behind the moon itself", () => {
    expect(moonLightAzimuth(0.5)).toBeCloseTo(0, 6);
    expect(Math.abs(moonLightAzimuth(0))).toBeCloseTo(PI, 6);
  });

  it("the waxing quarter is lit from the right, the waning one from the left", () => {
    // +x is the right of the screen: the light stands there, so the right limb is lit.
    expect(moonLightAzimuth(0.25)).toBeCloseTo(PI / 2, 6);
    expect(moonLightAzimuth(0.75)).toBeCloseTo(-PI / 2, 6);
  });
});
