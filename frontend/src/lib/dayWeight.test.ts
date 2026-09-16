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
  it("день без записи ничего не весит", () => {
    expect(dayWeight(day({ hasData: false }))).toBe(0);
  });

  it("день с записью, но без единого канала, тоже ноль", () => {
    expect(dayWeight(day())).toBe(0);
  });

  it("полный день по всем четырём каналам весит единицу", () => {
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

  it("канал сверх нормы не перевешивает остальные — каждый зажат единицей", () => {
    const over = dayWeight(day({ steps: STEPS_FULL * 9 }));
    const exact = dayWeight(day({ steps: STEPS_FULL }));
    expect(over).toBeCloseTo(exact, 5);
    expect(over).toBeCloseTo(0.25, 5);
  });

  it("пустой канал тянет вес вниз, а не выпадает из среднего", () => {
    // Contributions alone, and full ones at that: a quarter of the weight, not all of it.
    expect(dayWeight(day({ contributions: CODE_FULL }))).toBeCloseTo(0.25, 5);
  });

  it("каналы складываются: два полных канала — половина веса", () => {
    const w = dayWeight(day({ steps: STEPS_FULL, sleepMinutes: SLEEP_FULL }));
    expect(w).toBeCloseTo(0.5, 5);
  });

  it("канал считается пропорционально: половина нормы — половина своей доли", () => {
    expect(dayWeight(day({ sleepMinutes: SLEEP_FULL / 2 }))).toBeCloseTo(0.125, 5);
  });

  it("честный ноль в канале — это ноль, а не отсутствие данных", () => {
    // `0` and `null` weigh the same, but the difference lives on in `hasData` and the gap mark (§5).
    expect(dayWeight(day({ contributions: 0 }))).toBe(0);
  });

  it("дисциплина считается долей закрытых пунктов", () => {
    const w = dayWeight(
      day({ disciplineCounts: { stretch: 1, reading: 0, podcasts: 0, office: 0 } }),
    );
    // One item of four = 0.25 of a channel = 0.0625 of the weight.
    expect(w).toBeCloseTo(0.0625, 5);
  });

  it("монстр в дисциплине не участвует — он не пункт, который выполняют", () => {
    const withMonster = dayWeight(day({ disciplineCounts: { stretch: 1, monster: 1 } }));
    const without = dayWeight(day({ disciplineCounts: { stretch: 1 } }));
    expect(withMonster).toBeCloseTo(without, 5);
    expect(withMonster).toBeCloseTo(0.25, 5);
  });

  it("счётчики из одного монстра активных пунктов не дают — канал молчит", () => {
    expect(dayWeight(day({ disciplineCounts: { monster: 1 } }))).toBe(0);
  });

  it("счётчик пункта больше единицы не даёт ему двойного веса", () => {
    const w = dayWeight(day({ disciplineCounts: { reading: 5, office: 0 } }));
    expect(w).toBeCloseTo(0.125, 5);
  });

  it("вес всегда лежит в [0, 1]", () => {
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

  it("отрицательный мусор в канале не уводит вес в минус", () => {
    expect(dayWeight(day({ steps: -500 }))).toBe(0);
  });
});
