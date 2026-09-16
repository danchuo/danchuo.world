import { describe, expect, it } from "vitest";
import {
  average,
  axisBounds,
  clampOffset,
  maxOffset,
  niceMax,
  visibleWindow,
  type SparkPoint,
} from "./statsSparkline";

/** A chronological run of N days (old→new), value = index×1000, with optional gaps. */
function series(n: number, gaps: number[] = []): SparkPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, "0")}`,
    value: gaps.includes(i) ? null : i * 1000,
  }));
}

describe("maxOffset", () => {
  it("нулевой, когда история короче/равна окну (скроллить некуда)", () => {
    expect(maxOffset(5, 10)).toBe(0);
    expect(maxOffset(10, 10)).toBe(0);
  });

  it("равен избытку истории над окном", () => {
    expect(maxOffset(25, 10)).toBe(15);
  });
});

describe("clampOffset", () => {
  it("зажимает в [0, maxOffset]", () => {
    expect(clampOffset(-3, 25, 10)).toBe(0);
    expect(clampOffset(99, 25, 10)).toBe(15);
    expect(clampOffset(4, 25, 10)).toBe(4);
  });

  it("всегда 0, когда скроллить некуда", () => {
    expect(clampOffset(5, 8, 10)).toBe(0);
  });
});

describe("visibleWindow", () => {
  it("по умолчанию (offset 0) показывает последние `size` дней, сегодня — справа", () => {
    const w = visibleWindow(series(25), 10, 0);
    expect(w).toHaveLength(10);
    expect(w[0].date).toBe("2026-07-16"); // 25 days, the slice 15..24 (0-indexed)
    expect(w[9].date).toBe("2026-07-25");
  });

  it("offset листает окно в прошлое (влево вылезают старые дни)", () => {
    const w = visibleWindow(series(25), 10, 5);
    expect(w[0].date).toBe("2026-07-11");
    expect(w[9].date).toBe("2026-07-20");
  });

  it("offset зажимается — нельзя уехать за край истории", () => {
    const w = visibleWindow(series(25), 10, 999);
    expect(w[0].date).toBe("2026-07-01"); // we hit the oldest day
    expect(w).toHaveLength(10);
  });

  it("история короче окна — отдаёт всю историю как есть", () => {
    const w = visibleWindow(series(4), 10, 0);
    expect(w).toHaveLength(4);
    expect(w[0].date).toBe("2026-07-01");
    expect(w[3].date).toBe("2026-07-04");
  });

  it("пустая история — пустое окно", () => {
    expect(visibleWindow([], 10, 0)).toEqual([]);
  });
});

describe("niceMax", () => {
  it("максимум шагов по всей истории (стабильная ось при скролле)", () => {
    expect(niceMax(series(5))).toBe(4000);
  });

  it("игнорирует пропуски (null), не считает их нулём", () => {
    expect(niceMax(series(5, [4]))).toBe(3000); // day 4 (the largest) is a gap
  });

  it("не меньше 1 (защита от деления на ноль при пустой/нулевой истории)", () => {
    expect(niceMax([])).toBe(1);
    expect(niceMax([{ date: "x", value: 0 }])).toBe(1);
  });
});

describe("average", () => {
  it("среднее по непустым значениям, округлённое", () => {
    expect(average(series(4))).toBe(1500); // 0,1000,2000,3000 → 1500
  });

  it("игнорирует пропуски (не считает null нулём)", () => {
    expect(average(series(4, [0]))).toBe(2000); // only 1000, 2000, 3000 → 2000
  });

  it("null, когда данных в окне нет", () => {
    expect(average([])).toBeNull();
    expect(average(series(3, [0, 1, 2]))).toBeNull();
  });
});

describe("axisBounds", () => {
  const pts = (vals: (number | null)[]): SparkPoint[] => vals.map((v, i) => ({ date: `d${i}`, value: v }));

  it("стабильные значения (размах < minSpan) раздвигаются до minSpan + паддинг", () => {
    // [440,450,460] spans 20 < 120 → widened to [390,510], padding 120*0.15=18 → [372,528]
    expect(axisBounds(pts([440, 450, 460]), 120)).toEqual({ min: 372, max: 528 });
  });

  it("большой размах масштабируется по данным (+паддинг)", () => {
    // [300,600] spans 300 > 120 → padding 45 → [255,645]
    expect(axisBounds(pts([300, 600]), 120)).toEqual({ min: 255, max: 645 });
  });

  it("низ не опускается ниже 0", () => {
    // [50,60] → mid 55 → [-5,115] → padding 18 → [-23,133] → the floor clamps to 0
    expect(axisBounds(pts([50, 60]), 120)).toEqual({ min: 0, max: 133 });
  });

  it("пропуски игнорируются; пустое окно ⇒ [0, minSpan]", () => {
    expect(axisBounds(pts([null, 450, null]), 120).max).toBeGreaterThan(450);
    expect(axisBounds([], 120)).toEqual({ min: 0, max: 120 });
  });
});
