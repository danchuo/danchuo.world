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
  it("zero when the history is shorter than/equal to the window (nothing to scroll)", () => {
    expect(maxOffset(5, 10)).toBe(0);
    expect(maxOffset(10, 10)).toBe(0);
  });

  it("equals the history's excess over the window", () => {
    expect(maxOffset(25, 10)).toBe(15);
  });
});

describe("clampOffset", () => {
  it("clamps to [0, maxOffset]", () => {
    expect(clampOffset(-3, 25, 10)).toBe(0);
    expect(clampOffset(99, 25, 10)).toBe(15);
    expect(clampOffset(4, 25, 10)).toBe(4);
  });

  it("always 0 when there is nothing to scroll", () => {
    expect(clampOffset(5, 8, 10)).toBe(0);
  });
});

describe("visibleWindow", () => {
  it("by default (offset 0) shows the last `size` days, today on the right", () => {
    const w = visibleWindow(series(25), 10, 0);
    expect(w).toHaveLength(10);
    expect(w[0].date).toBe("2026-07-16"); // 25 days, the slice 15..24 (0-indexed)
    expect(w[9].date).toBe("2026-07-25");
  });

  it("offset pages the window into the past (older days come in from the left)", () => {
    const w = visibleWindow(series(25), 10, 5);
    expect(w[0].date).toBe("2026-07-11");
    expect(w[9].date).toBe("2026-07-20");
  });

  it("offset is clamped — you cannot scroll past the edge of history", () => {
    const w = visibleWindow(series(25), 10, 999);
    expect(w[0].date).toBe("2026-07-01"); // we hit the oldest day
    expect(w).toHaveLength(10);
  });

  it("a history shorter than the window — returns the whole history as is", () => {
    const w = visibleWindow(series(4), 10, 0);
    expect(w).toHaveLength(4);
    expect(w[0].date).toBe("2026-07-01");
    expect(w[3].date).toBe("2026-07-04");
  });

  it("an empty history — an empty window", () => {
    expect(visibleWindow([], 10, 0)).toEqual([]);
  });
});

describe("niceMax", () => {
  it("the maximum of steps over the whole history (a stable axis when scrolling)", () => {
    expect(niceMax(series(5))).toBe(4000);
  });

  it("ignores gaps (null), does not count them as zero", () => {
    expect(niceMax(series(5, [4]))).toBe(3000); // day 4 (the largest) is a gap
  });

  it("no less than 1 (guards against division by zero on an empty/zero history)", () => {
    expect(niceMax([])).toBe(1);
    expect(niceMax([{ date: "x", value: 0 }])).toBe(1);
  });
});

describe("average", () => {
  it("the mean of non-empty values, rounded", () => {
    expect(average(series(4))).toBe(1500); // 0,1000,2000,3000 → 1500
  });

  it("ignores gaps (does not count null as zero)", () => {
    expect(average(series(4, [0]))).toBe(2000); // only 1000, 2000, 3000 → 2000
  });

  it("null when there is no data in the window", () => {
    expect(average([])).toBeNull();
    expect(average(series(3, [0, 1, 2]))).toBeNull();
  });
});

describe("axisBounds", () => {
  const pts = (vals: (number | null)[]): SparkPoint[] => vals.map((v, i) => ({ date: `d${i}`, value: v }));

  it("stable values (range < minSpan) are spread to minSpan + padding", () => {
    // [440,450,460] spans 20 < 120 → widened to [390,510], padding 120*0.15=18 → [372,528]
    expect(axisBounds(pts([440, 450, 460]), 120)).toEqual({ min: 372, max: 528 });
  });

  it("a large range scales to the data (+padding)", () => {
    // [300,600] spans 300 > 120 → padding 45 → [255,645]
    expect(axisBounds(pts([300, 600]), 120)).toEqual({ min: 255, max: 645 });
  });

  it("the bottom does not go below 0", () => {
    // [50,60] → mid 55 → [-5,115] → padding 18 → [-23,133] → the floor clamps to 0
    expect(axisBounds(pts([50, 60]), 120)).toEqual({ min: 0, max: 133 });
  });

  it("gaps are ignored; an empty window ⇒ [0, minSpan]", () => {
    expect(axisBounds(pts([null, 450, null]), 120).max).toBeGreaterThan(450);
    expect(axisBounds([], 120)).toEqual({ min: 0, max: 120 });
  });
});
