import { describe, expect, it } from "vitest";
import {
  DRAG_SLOP,
  FLING_MAX,
  FLING_MIN,
  decayVelocity,
  driftSpeed,
  flingVelocity,
  WHEEL_LINE_PX,
  WHEEL_PAGE_PX,
  wheelDelta,
  wrapOffset,
} from "./marqueeMotion";

describe("wrapOffset — the ribbon is endless in both directions", () => {
  it("an offset within the copy stays as is", () => {
    expect(wrapOffset(0, 500)).toBe(0);
    expect(wrapOffset(120, 500)).toBe(120);
  });

  it("went forward past the copy — return to its start", () => {
    expect(wrapOffset(500, 500)).toBe(0);
    expect(wrapOffset(620, 500)).toBe(120);
  });

  it("went BACK past zero — enter from the end of the copy instead of hitting the edge", () => {
    // This is what the positive remainder is for: paging back is endless, as forward is, or the
    // ribbon would stall at the start of its single loop.
    expect(wrapOffset(-1, 500)).toBe(499);
    expect(wrapOffset(-620, 500)).toBe(380);
  });

  it("no copy (the ribbon fits) or the count went off — the offset is zero, no NaN", () => {
    for (const span of [0, -10, Number.NaN]) expect(wrapOffset(120, span)).toBe(0);
    expect(wrapOffset(Number.NaN, 500)).toBe(0);
  });
});

describe("flingVelocity — a fling is measured at the end of the drag", () => {
  it("an even drag → its own velocity (px/ms)", () => {
    const v = flingVelocity([
      { t: 0, pos: 0 },
      { t: 50, pos: 50 },
      { t: 100, pos: 100 },
    ]);
    expect(v).toBeCloseTo(1, 3);
  });

  it("the sign is kept: back is a negative velocity", () => {
    expect(flingVelocity([{ t: 0, pos: 100 }, { t: 100, pos: 0 }])).toBeCloseTo(-1, 3);
  });

  it("the finger stopped before release ⇒ no fling", () => {
    // Measuring across the whole drag is wrong: "moved it there and held" points at a place rather
    // than throwing, and on release the ribbon must stay where it was left.
    const v = flingVelocity([
      { t: 0, pos: 0 },
      { t: 400, pos: 300 },
      { t: 480, pos: 300 },
      { t: 500, pos: 300 },
    ]);
    expect(v).toBe(0);
  });

  it("two points at one instant (events came in a batch) do not give infinite velocity", () => {
    // Measured on the live board: pointer events sent back to back landed within fractions of a
    // millisecond, and an honest derivative threw the ribbon hundreds of copies ahead in one frame.
    const v = flingVelocity([
      { t: 0, pos: 0 },
      { t: 0.2, pos: -50 },
    ]);
    expect(Math.abs(v)).toBeLessThanOrEqual(FLING_MAX);
    expect(v).toBeLessThan(0); // the throw's direction is preserved
  });

  it("one point or a zero interval → zero, no division by zero", () => {
    expect(flingVelocity([{ t: 10, pos: 5 }])).toBe(0);
    expect(flingVelocity([])).toBe(0);
    expect(flingVelocity([{ t: 10, pos: 0 }, { t: 10, pos: 40 }])).toBe(0);
  });
});

describe("decayVelocity — a fling decays by time, not by frame count", () => {
  it("over the same time the decay is the same at any fps", () => {
    const one = decayVelocity(1, 32);
    const two = decayVelocity(decayVelocity(1, 16), 16);
    expect(one).toBeCloseTo(two, 3);
  });

  it("the slow remainder is zeroed so the ribbon does not crawl forever", () => {
    expect(decayVelocity(FLING_MIN / 2, 16)).toBe(0);
  });

  it("a live fling slows down but does not reverse", () => {
    const v = decayVelocity(2, 16);
    expect(v).toBeLessThan(2);
    expect(v).toBeGreaterThan(0);
  });
});

describe("driftSpeed — the ribbon's own drift", () => {
  it("the copy travels exactly in the allotted time", () => {
    const speed = driftSpeed(600, 30); // px/ms
    expect(speed * 30_000).toBeCloseTo(600, 6);
  });

  it("nothing to travel (no copy) → the ribbon stands still", () => {
    expect(driftSpeed(0, 30)).toBe(0);
    expect(driftSpeed(600, 0)).toBe(0);
  });
});

describe("DRAG_SLOP", () => {
  it("the drag threshold is noticeably larger than hand tremor on a tap", () => {
    expect(DRAG_SLOP).toBeGreaterThanOrEqual(4);
    expect(DRAG_SLOP).toBeLessThanOrEqual(12);
  });
});

describe("wheelDelta — the ribbon scrolls by wheel/touchpad on hover", () => {
  it("horizontal ribbon: a cross touchpad swipe pages it by the pixels travelled", () => {
    expect(wheelDelta({ deltaX: 40, deltaY: 0, deltaMode: 0 }, false)).toBe(40);
    expect(wheelDelta({ deltaX: -40, deltaY: 0, deltaMode: 0 }, false)).toBe(-40);
  });

  it("a plain wheel (up/down only) pages the horizontal ribbon too", () => {
    // A mouse has no cross axis at all, and a trackpad's habitual gesture is vertical. Give the
    // ribbon only its own axis and "spin it on hover" would work for almost nobody.
    expect(wheelDelta({ deltaX: 0, deltaY: 50, deltaMode: 0 }, false)).toBe(50);
  });

  it("a diagonal gesture follows its main axis, not the sum", () => {
    expect(wheelDelta({ deltaX: 30, deltaY: -8, deltaMode: 0 }, false)).toBe(30);
    expect(wheelDelta({ deltaX: 8, deltaY: -30, deltaMode: 0 }, false)).toBe(-30);
  });

  it("a vertical ribbon treats its own axis as the main one", () => {
    // Equal deltas are a tie, and the tie goes to the ribbon's own axis.
    expect(wheelDelta({ deltaX: 30, deltaY: 30, deltaMode: 0 }, true)).toBe(30);
    expect(wheelDelta({ deltaX: 30, deltaY: 30, deltaMode: 0 }, false)).toBe(30);
    expect(wheelDelta({ deltaX: 8, deltaY: 30, deltaMode: 0 }, true)).toBe(30);
  });

  it("a delta in lines and pages is converted to pixels", () => {
    // Firefox sends wheel deltas in lines (deltaMode 1), not pixels: without converting, the
    // ribbon would crawl three pixels per click.
    expect(wheelDelta({ deltaX: 0, deltaY: 3, deltaMode: 1 }, false)).toBe(3 * WHEEL_LINE_PX);
    expect(wheelDelta({ deltaX: 0, deltaY: 1, deltaMode: 2 }, false)).toBe(WHEEL_PAGE_PX);
  });

  it("the count went off — the delta is zero, no NaN", () => {
    expect(wheelDelta({ deltaX: Number.NaN, deltaY: Number.NaN, deltaMode: 0 }, false)).toBe(0);
  });
});
