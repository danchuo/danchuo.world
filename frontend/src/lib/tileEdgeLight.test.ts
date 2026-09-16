import { describe, expect, it } from "vitest";
import { edgeVector } from "./tileEdgeLight";

/** A 200×100 tile at (100, 50) on screen — easy to compute from in one's head. */
const RECT = { left: 100, top: 50, width: 200, height: 100 };

describe("edgeVector", () => {
  it("центр плитки — нулевой вектор: свет ровный по всей кромке", () => {
    expect(edgeVector(RECT, 200, 100)).toEqual({ dx: 0, dy: 0 });
  });

  it("углы дают единичные орты — свет уходит в ближний к курсору торец", () => {
    expect(edgeVector(RECT, 100, 50)).toEqual({ dx: -1, dy: -1 });
    expect(edgeVector(RECT, 300, 150)).toEqual({ dx: 1, dy: 1 });
  });

  it("координата на четверти ширины даёт половину орта — свет едет плавно, а не скачком", () => {
    expect(edgeVector(RECT, 150, 100)).toEqual({ dx: -0.5, dy: 0 });
  });

  it("точка за пределами плитки зажимается в [-1, 1]", () => {
    // The pointer can leave the bounds between rAF frames: without clamping, the edge would get an
    // offset larger than its own box and the highlight would come away from the rim.
    expect(edgeVector(RECT, -400, 900)).toEqual({ dx: -1, dy: 1 });
  });

  it("плитка нулевого размера — null, а не деление на ноль", () => {
    // A tile hidden by a wave (`display: none`) returns a zero rect: it cannot be divided by, and
    // there is no point writing variables into it.
    expect(edgeVector({ left: 0, top: 0, width: 0, height: 0 }, 0, 0)).toBeNull();
  });
});
