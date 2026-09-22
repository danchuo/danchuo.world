import { describe, expect, it } from "vitest";
import { areaPath, traceIslands, traceSegments, type TracePoint } from "./ghostTrace";

const pt = (x: number, y: number | null): TracePoint => ({ x, y });

describe("traceSegments — a gap stays a BREAK, not a zero", () => {
  it("a continuous row is one polyline", () => {
    expect(traceSegments([pt(0, 10), pt(10, 20), pt(20, 15)])).toEqual(["0,10 10,20 20,15"]);
  });

  it("a hole in the middle breaks the polyline in two instead of joining across it", () => {
    // A night the watch missed is not a night without sleep: a line drawn straight through it
    // would invent data that never existed.
    expect(traceSegments([pt(0, 10), pt(10, 20), pt(20, null), pt(30, 5), pt(40, 8)])).toEqual([
      "0,10 10,20",
      "30,5 40,8",
    ]);
  });

  it("a lone value between two holes gives no polyline — the line has no second end", () => {
    expect(traceSegments([pt(0, null), pt(10, 7), pt(20, null)])).toEqual([]);
  });

  it("an empty row and a row made entirely of holes — not a single polyline", () => {
    expect(traceSegments([])).toEqual([]);
    expect(traceSegments([pt(0, null), pt(10, null)])).toEqual([]);
  });
});

describe("traceIslands — a lone day is still visible", () => {
  it("a value surrounded by holes is returned as a dot", () => {
    // Otherwise the only day in a week with data draws nothing at all, and the chart says the
    // week was empty — the opposite of the truth.
    expect(traceIslands([pt(0, null), pt(10, 7), pt(20, null)])).toEqual([{ x: 10, y: 7 }]);
  });

  it("a value in the row is not duplicated by a dot — the polyline already carries it", () => {
    expect(traceIslands([pt(0, 3), pt(10, 7), pt(20, 5)])).toEqual([]);
  });

  it("a row every other day — each day is its own island, including the edge ones", () => {
    expect(traceIslands([pt(0, 1), pt(10, null), pt(20, 2), pt(30, null), pt(40, 3)])).toEqual([
      { x: 0, y: 1 },
      { x: 20, y: 2 },
      { x: 40, y: 3 },
    ]);
  });
});

describe("areaPath — the fill closes on the tile's EDGE, not on the axis", () => {
  it("one row is one subpath closed along the floor", () => {
    expect(areaPath([pt(0, 10), pt(10, 20)], 100)).toBe("M 0 100 L 0 10 L 10 20 L 10 100 Z");
  });

  it("a hole gives two independent subpaths with no fill between them", () => {
    const d = areaPath([pt(0, 10), pt(10, 20), pt(20, null), pt(30, 5), pt(40, 8)], 100);
    expect(d).toBe("M 0 100 L 0 10 L 10 20 L 10 100 Z M 30 100 L 30 5 L 40 8 L 40 100 Z");
  });

  it("nothing to fill ⇒ an empty string, not a path of zeros", () => {
    expect(areaPath([pt(0, null)], 100)).toBe("");
    expect(areaPath([], 100)).toBe("");
  });
});
