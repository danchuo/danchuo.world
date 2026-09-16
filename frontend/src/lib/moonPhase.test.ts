import { describe, expect, it } from "vitest";
import { moonLitPath, moonPhase } from "./moonPhase";

// Опорные даты — астрономические новолуния и полнолуния. Допуск считается сутками цикла:
// фаза берётся на полночь, а само событие приходится на любой час своих суток, поэтому
// половину допуска съедает уже он. Полутора суток хватает, чтобы поймать и сбитую опорную
// точку, и неверную длину месяца, — а точнее приближение и не обязано быть: глиф в полтора
// десятка пикселей разницы в сутки не показывает.
const DAY = 1 / 29.530588853;
const TOLERANCE = 1.5 * DAY;

describe("moonPhase", () => {
  it("новолуние 11 января 2024 — начало цикла", () => {
    const phase = moonPhase("2024-01-11")!;
    expect(Math.min(phase.cycle, 1 - phase.cycle)).toBeLessThan(TOLERANCE);
    expect(phase.lit).toBeLessThan(0.02);
  });

  it("полнолуние 25 января 2024 — середина цикла", () => {
    const phase = moonPhase("2024-01-25")!;
    expect(Math.abs(phase.cycle - 0.5)).toBeLessThan(TOLERANCE);
    expect(phase.lit).toBeGreaterThan(0.98);
  });

  it("первая четверть растёт, последняя убывает — половина диска в обе", () => {
    const first = moonPhase("2024-01-18")!;
    const last = moonPhase("2024-02-02")!;
    expect(Math.abs(first.lit - 0.5)).toBeLessThan(0.1);
    expect(Math.abs(last.lit - 0.5)).toBeLessThan(0.1);
    expect(first.waxing).toBe(true);
    expect(last.waxing).toBe(false);
  });

  it("битая дата — пусто, а не NaN в разметке", () => {
    expect(moonPhase("нет даты")).toBeNull();
  });
});

describe("moonLitPath", () => {
  it("новолуние — контур нулевой площади, полнолуние — весь диск", () => {
    // У обоих терминатор идёт по самому краю (полуось равна радиусу), и различает их только
    // сторона выгиба: к свету — серпом, от света — горбом.
    expect(moonLitPath(0, 7)).toContain("A 7 7 0 0 0");
    expect(moonLitPath(0.5, 7)).toContain("A 7 7 0 0 1");
  });

  it("четверть — прямой терминатор", () => {
    expect(moonLitPath(0.25, 7)).toContain("A 0 7");
  });

  it("серп и горб выгнуты в разные стороны", () => {
    const crescent = moonLitPath(0.1, 7).split("A").pop()!;
    const gibbous = moonLitPath(0.4, 7).split("A").pop()!;
    expect(crescent).toContain("0 0 0");
    expect(gibbous).toContain("0 0 1");
  });
});
