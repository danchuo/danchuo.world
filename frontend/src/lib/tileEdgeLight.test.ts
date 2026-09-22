import { describe, expect, it } from "vitest";
import { edgeVector } from "./tileEdgeLight";

/** A 200×100 tile at (100, 50) on screen — easy to compute from in one's head. */
const RECT = { left: 100, top: 50, width: 200, height: 100 };

describe("edgeVector", () => {
  it("the tile's centre is a zero vector: the light is even along the whole edge", () => {
    expect(edgeVector(RECT, 200, 100)).toEqual({ dx: 0, dy: 0 });
  });

  it("corners give unit vectors — the light goes to the end nearest the cursor", () => {
    expect(edgeVector(RECT, 100, 50)).toEqual({ dx: -1, dy: -1 });
    expect(edgeVector(RECT, 300, 150)).toEqual({ dx: 1, dy: 1 });
  });

  it("a coordinate at a quarter of the width gives half the unit vector — the light moves smoothly, not in a jump", () => {
    expect(edgeVector(RECT, 150, 100)).toEqual({ dx: -0.5, dy: 0 });
  });

  it("a point outside the tile is clamped to [-1, 1]", () => {
    // The pointer can leave the bounds between rAF frames: without clamping, the edge would get an
    // offset larger than its own box and the highlight would come away from the rim.
    expect(edgeVector(RECT, -400, 900)).toEqual({ dx: -1, dy: 1 });
  });

  it("a zero-size tile — null, not a division by zero", () => {
    // A tile hidden by a wave (`display: none`) returns a zero rect: it cannot be divided by, and
    // there is no point writing variables into it.
    expect(edgeVector({ left: 0, top: 0, width: 0, height: 0 }, 0, 0)).toBeNull();
  });
});
