import { describe, expect, it } from "vitest";
import { areaPath, traceIslands, traceSegments, type TracePoint } from "./ghostTrace";

const pt = (x: number, y: number | null): TracePoint => ({ x, y });

describe("traceSegments — пропуск остаётся РАЗРЫВОМ, а не нулём", () => {
  it("непрерывный ряд — одна ломаная", () => {
    expect(traceSegments([pt(0, 10), pt(10, 20), pt(20, 15)])).toEqual(["0,10 10,20 20,15"]);
  });

  it("дыра посередине рвёт ломаную на две, а не соединяет через неё", () => {
    // A night the watch missed is not a night without sleep: a line drawn straight through it
    // would invent data that never existed.
    expect(traceSegments([pt(0, 10), pt(10, 20), pt(20, null), pt(30, 5), pt(40, 8)])).toEqual([
      "0,10 10,20",
      "30,5 40,8",
    ]);
  });

  it("одинокое значение между двумя дырами ломаной не даёт — у линии нет второго конца", () => {
    expect(traceSegments([pt(0, null), pt(10, 7), pt(20, null)])).toEqual([]);
  });

  it("пустой ряд и ряд целиком из дыр — ни одной ломаной", () => {
    expect(traceSegments([])).toEqual([]);
    expect(traceSegments([pt(0, null), pt(10, null)])).toEqual([]);
  });
});

describe("traceIslands — одинокий день всё равно виден", () => {
  it("значение, окружённое дырами, отдаётся точкой", () => {
    // Otherwise the only day in a week with data draws nothing at all, and the chart says the
    // week was empty — the opposite of the truth.
    expect(traceIslands([pt(0, null), pt(10, 7), pt(20, null)])).toEqual([{ x: 10, y: 7 }]);
  });

  it("значение в ряду точкой не дублируется — его уже несёт ломаная", () => {
    expect(traceIslands([pt(0, 3), pt(10, 7), pt(20, 5)])).toEqual([]);
  });

  it("ряд через день — каждый день сам себе остров, включая крайние", () => {
    expect(traceIslands([pt(0, 1), pt(10, null), pt(20, 2), pt(30, null), pt(40, 3)])).toEqual([
      { x: 0, y: 1 },
      { x: 20, y: 2 },
      { x: 40, y: 3 },
    ]);
  });
});

describe("areaPath — заливка закрывается на КРАЙ плитки, а не на ось", () => {
  it("один ряд — один подпуть, замкнутый по полу", () => {
    expect(areaPath([pt(0, 10), pt(10, 20)], 100)).toBe("M 0 100 L 0 10 L 10 20 L 10 100 Z");
  });

  it("дыра даёт два независимых подпути, между ними заливки нет", () => {
    const d = areaPath([pt(0, 10), pt(10, 20), pt(20, null), pt(30, 5), pt(40, 8)], 100);
    expect(d).toBe("M 0 100 L 0 10 L 10 20 L 10 100 Z M 30 100 L 30 5 L 40 8 L 40 100 Z");
  });

  it("нечего заливать ⇒ пустая строка, а не путь из нулей", () => {
    expect(areaPath([pt(0, null)], 100)).toBe("");
    expect(areaPath([], 100)).toBe("");
  });
});
