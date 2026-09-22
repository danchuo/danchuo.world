import { describe, expect, it } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { CODE_FULL, dayWeight, SLEEP_FULL, STEPS_FULL } from "./dayWeight";

function day(over: Partial<DaySummary> = {}): DaySummary {
  return {
    date: "2026-09-01",
    title: null,
    hasData: true,
    steps: null,
    sleepMinutes: null,
    contributions: null,
    disciplineCounts: null,
    monsterDrunk: null,
    ...over,
  } as DaySummary;
}

describe("dayWeight", () => {
  it("a day without a record weighs nothing", () => {
    expect(dayWeight(day({ hasData: false }))).toBe(0);
  });

  it("a day with a record but not a single channel is zero too", () => {
    expect(dayWeight(day())).toBe(0);
  });

  it("a full day on all four channels weighs one", () => {
    const w = dayWeight(
      day({
        steps: STEPS_FULL,
        sleepMinutes: SLEEP_FULL,
        contributions: CODE_FULL,
        disciplineCounts: { stretch: 1, reading: 2, office: 1 },
      }),
    );
    expect(w).toBeCloseTo(1, 5);
  });

  it("a channel above the norm does not outweigh the rest — each is clamped to one", () => {
    const over = dayWeight(day({ steps: STEPS_FULL * 9 }));
    const exact = dayWeight(day({ steps: STEPS_FULL }));
    expect(over).toBeCloseTo(exact, 5);
    expect(over).toBeCloseTo(0.25, 5);
  });

  it("an empty channel pulls the weight down instead of dropping out of the average", () => {
    // Contributions alone, and full ones at that: a quarter of the weight, not all of it.
    expect(dayWeight(day({ contributions: CODE_FULL }))).toBeCloseTo(0.25, 5);
  });

  it("channels add up: two full channels are half the weight", () => {
    const w = dayWeight(day({ steps: STEPS_FULL, sleepMinutes: SLEEP_FULL }));
    expect(w).toBeCloseTo(0.5, 5);
  });

  it("a channel counts proportionally: half the norm is half its share", () => {
    expect(dayWeight(day({ sleepMinutes: SLEEP_FULL / 2 }))).toBeCloseTo(0.125, 5);
  });

  it("an honest zero in a channel is a zero, not missing data", () => {
    // `0` and `null` weigh the same, but the difference lives on in `hasData` and the gap mark (§5).
    expect(dayWeight(day({ contributions: 0 }))).toBe(0);
  });

  it("discipline is counted as the share of closed items", () => {
    const w = dayWeight(
      day({ disciplineCounts: { stretch: 1, reading: 0, podcasts: 0, office: 0 } }),
    );
    // One item of four = 0.25 of a channel = 0.0625 of the weight.
    expect(w).toBeCloseTo(0.0625, 5);
  });

  it("the monster takes no part in discipline — it is not an item that gets done", () => {
    const withMonster = dayWeight(day({ disciplineCounts: { stretch: 1, monster: 1 } }));
    const without = dayWeight(day({ disciplineCounts: { stretch: 1 } }));
    expect(withMonster).toBeCloseTo(without, 5);
    expect(withMonster).toBeCloseTo(0.25, 5);
  });

  it("counters with only the monster give no active items — the channel is silent", () => {
    expect(dayWeight(day({ disciplineCounts: { monster: 1 } }))).toBe(0);
  });

  it("an item counter above one does not give it double weight", () => {
    const w = dayWeight(day({ disciplineCounts: { reading: 5, office: 0 } }));
    expect(w).toBeCloseTo(0.125, 5);
  });

  it("the weight always lies in [0, 1]", () => {
    const w = dayWeight(
      day({
        steps: 999_999,
        sleepMinutes: 5000,
        contributions: 500,
        disciplineCounts: { a: 9, b: 9 },
      }),
    );
    expect(w).toBeLessThanOrEqual(1);
    expect(w).toBeGreaterThanOrEqual(0);
    expect(w).toBeCloseTo(1, 5);
  });

  it("negative garbage in a channel does not push the weight below zero", () => {
    expect(dayWeight(day({ steps: -500 }))).toBe(0);
  });
});
