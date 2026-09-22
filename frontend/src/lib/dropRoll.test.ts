import { describe, expect, it } from "vitest";
import {
  FRAME_WHEEL_GAP_MS,
  FRAME_WHEEL_TRAVEL_PX,
  SWIPE_NOTCH,
  centerScroll,
  frameWheelStep,
  initialFrameWheel,
  nearestFrameIndex,
  rollMotionStep,
  startFrameIndex,
  stepFrameIndex,
  stripPadding,
  swipeStep,
  tickIndexAt,
  toothHeight,
  wheelStep,
} from "./dropRoll";

describe("nearestFrameIndex", () => {
  const centers = [58, 180, 302, 424, 546];

  it("takes the frame whose centre is closest to the middle of the window", () => {
    expect(nearestFrameIndex(centers, 190)).toBe(1);
    expect(nearestFrameIndex(centers, 290)).toBe(2);
  });

  it("at the edges returns the edge frames", () => {
    expect(nearestFrameIndex(centers, 0)).toBe(0);
    expect(nearestFrameIndex(centers, 9999)).toBe(4);
  });

  it("at equal distance keeps the one earlier in the ribbon", () => {
    expect(nearestFrameIndex(centers, 119)).toBe(0);
  });

  it("an empty ribbon ⇒ 0 (there is no frame, but an index is required)", () => {
    expect(nearestFrameIndex([], 100)).toBe(0);
  });
});

describe("startFrameIndex", () => {
  const photos = [{ imageUrl: "/a" }, { imageUrl: "/b" }, { imageUrl: "/c" }];

  it("opens EXACTLY the frame the tile was showing", () => {
    expect(startFrameIndex(photos, "/c")).toBe(2);
  });

  it("without an address — the first frame", () => {
    expect(startFrameIndex(photos)).toBe(0);
    expect(startFrameIndex(photos, null)).toBe(0);
  });

  it("recognises the frame by the preview address too: the drop cover arrives with the thumb address", () => {
    const withThumbs = [
      { imageUrl: "/a/web", thumbUrl: "/a/thumb" },
      { imageUrl: "/b/web", thumbUrl: "/b/thumb" },
    ];
    expect(startFrameIndex(withThumbs, "/b/thumb")).toBe(1);
  });

  it("an address not from this drop ⇒ the first frame, not emptiness", () => {
    expect(startFrameIndex(photos, "/z")).toBe(0);
    expect(startFrameIndex([], "/a")).toBe(0);
  });
});

describe("stripPadding", () => {
  it("side margin = half the window minus half a frame: edge frames land in the centre", () => {
    expect(stripPadding(500, 116)).toBe(192);
  });

  it("a frame wider than the window ⇒ no margin (otherwise the ribbon goes negative)", () => {
    expect(stripPadding(100, 116)).toBe(0);
  });

  it("the window is not measured yet ⇒ 0", () => {
    expect(stripPadding(0, 116)).toBe(0);
  });
});

describe("wheelStep", () => {
  it("a mouse click = exactly one frame, however many pixels it brought", () => {
    expect(wheelStep(0, 100, 0, 0)).toEqual({ dir: 1, acc: 0 });
    expect(wheelStep(0, -240, 0, 0)).toEqual({ dir: -1, acc: 0 });
  });

  it("small trackpad deltas accumulate and give a frame only together", () => {
    const a = wheelStep(0, 12, 0, 0);
    expect(a).toEqual({ dir: 0, acc: 12 });
    const b = wheelStep(0, 12, 0, a.acc);
    expect(b).toEqual({ dir: 0, acc: 24 });
    const c = wheelStep(0, 20, 0, b.acc);
    expect(c).toEqual({ dir: 1, acc: 0 });
  });

  it("a horizontal trackpad gesture pages the same as a vertical one", () => {
    expect(wheelStep(-100, 0, 0, 0)).toEqual({ dir: -1, acc: 0 });
  });

  it("a delta in lines (Firefox) is converted to pixels", () => {
    expect(wheelStep(0, 3, 1, 0)).toEqual({ dir: 1, acc: 0 });
  });

  it("a zero event changes nothing", () => {
    expect(wheelStep(0, 0, 0, 17)).toEqual({ dir: 0, acc: 17 });
  });

  it("a direction change does not drag along what was accumulated the other way", () => {
    const a = wheelStep(0, 20, 0, 0);
    const b = wheelStep(0, -20, 0, a.acc);
    expect(b).toEqual({ dir: 0, acc: 0 });
  });
});


describe("toothHeight", () => {
  it("right under the cursor the tick grows to the ceiling", () => {
    expect(toothHeight(0, 78, 8, 30)).toBe(30);
  });

  it("beyond the magnet radius a tick stays at its own height", () => {
    expect(toothHeight(78, 78, 8, 30)).toBe(8);
    expect(toothHeight(400, 78, 8, 30)).toBe(8);
  });

  it("at half the radius it adds exactly half the increment (cosine squared)", () => {
    expect(toothHeight(39, 78, 8, 30)).toBeCloseTo(19, 6);
  });

  it("the falloff is symmetric: the cursor's side does not matter", () => {
    expect(toothHeight(-30, 78, 8, 30)).toBe(toothHeight(30, 78, 8, 30));
  });

  it("the current frame has its own larger base — it does not sink under the magnet", () => {
    expect(toothHeight(78, 78, 26, 30)).toBe(26);
    expect(toothHeight(0, 78, 26, 30)).toBe(30);
  });

  it("the radius is not measured yet ⇒ the base height, not a division by zero", () => {
    expect(toothHeight(0, 0, 8, 30)).toBe(8);
  });
});

describe("tickIndexAt", () => {
  it("the tick under the cursor: the row is split into equal shares", () => {
    expect(tickIndexAt(0, 370, 37)).toBe(0);
    expect(tickIndexAt(105, 370, 37)).toBe(10);
    expect(tickIndexAt(369, 370, 37)).toBe(36);
  });

  it("a miss past the row's end returns the edge tick, not emptiness", () => {
    expect(tickIndexAt(-40, 370, 37)).toBe(0);
    expect(tickIndexAt(9999, 370, 37)).toBe(36);
  });

  it("the row is not measured yet ⇒ the first tick", () => {
    expect(tickIndexAt(100, 0, 37)).toBe(0);
    expect(tickIndexAt(100, 370, 0)).toBe(0);
  });
});

describe("stepFrameIndex — a neighbour within the drop", () => {
  it("steps forward and back", () => {
    expect(stepFrameIndex(2, 1, 6)).toBe(3);
    expect(stepFrameIndex(2, -1, 6)).toBe(1);
  });

  it("no step past the edges: the drop's ribbon does not loop", () => {
    expect(stepFrameIndex(0, -1, 6)).toBe(0);
    expect(stepFrameIndex(5, 1, 6)).toBe(5);
  });

  it("a one-frame drop stays in place in both directions", () => {
    expect(stepFrameIndex(0, 1, 1)).toBe(0);
    expect(stepFrameIndex(0, -1, 1)).toBe(0);
  });
});

describe("rollMotionStep", () => {
  const cell = 124;

  it("half a pixel from the target it lands exactly on it instead of trembling forever", () => {
    expect(rollMotionStep(1000.3, 1000, 16.7, cell)).toBe(1000);
  });

  it("approaches the target per frame and never overshoots it", () => {
    const right = rollMotionStep(1000, 1124, 16.7, cell);
    expect(right).toBeGreaterThan(1000);
    expect(right).toBeLessThan(1124);
    const left = rollMotionStep(1124, 1000, 16.7, cell);
    expect(left).toBeLessThan(1124);
    expect(left).toBeGreaterThan(1000);
  });

  it("the further the ribbon lags, the larger SHARE of the path it covers per frame: a quick click is caught up faster", () => {
    const near = rollMotionStep(0, cell, 16.7, cell) / cell;
    const far = rollMotionStep(0, cell * 6, 16.7, cell) / (cell * 6);
    expect(far).toBeGreaterThan(near);
  });

  it("the share does not grow without limit: a very distant target is still not reached in one jump", () => {
    expect(rollMotionStep(0, cell * 40, 16.7, cell)).toBeLessThan(cell * 40 * 0.6);
  });

  it("viscosity is a ribbon parameter: with a smaller share the same path is covered more slowly", () => {
    const usual = rollMotionStep(0, cell, 16.7, cell);
    const slow = rollMotionStep(0, cell, 16.7, cell, 0.13);
    expect(slow).toBeGreaterThan(0);
    expect(slow).toBeLessThan(usual);
  });

  it("a slow ribbon still arrives: in a second it is exactly on target", () => {
    let pos = 0;
    for (let i = 0; i < 60; i += 1) pos = rollMotionStep(pos, cell, 16.7, cell, 0.13);
    expect(pos).toBe(cell);
  });

  it("a stalled render frame does not turn into a jump: time counts for at most two frames", () => {
    expect(rollMotionStep(0, cell, 200, cell)).toBeCloseTo(rollMotionStep(0, cell, 1000 / 30, cell), 6);
  });

  it("zero time — the ribbon in place", () => {
    expect(rollMotionStep(500, 1000, 0, cell)).toBe(500);
  });
});

describe("swipeStep — dragging a frame with a finger", () => {
  it("a short move does not page the frame but accumulates", () => {
    const step = swipeStep(20, 0);
    expect(step.dir).toBe(0);
    expect(step.acc).toBe(20);
  });

  it("movement accumulated past the threshold is worth one frame, the remainder carries over", () => {
    // 20 was already accumulated and another 40 arrived — the threshold is crossed to the right,
    // which means back along the reel.
    const step = swipeStep(40, 20);
    expect(step.dir).toBe(-1);
    expect(step.acc).toBe(60 - SWIPE_NOTCH);
  });

  it("a finger to the left takes the ribbon forward, to the right back", () => {
    expect(swipeStep(-SWIPE_NOTCH, 0).dir).toBe(1);
    expect(swipeStep(SWIPE_NOTCH, 0).dir).toBe(-1);
  });

  it("a long move does not accumulate a debt: the remainder is below the threshold", () => {
    const step = swipeStep(-SWIPE_NOTCH * 3, 0);
    expect(step.dir).toBe(1);
    expect(Math.abs(step.acc)).toBeLessThan(SWIPE_NOTCH * 3);
  });
});

describe("centerScroll — a cell in the middle of the window", () => {
  it("centres the cell in the window", () => {
    // A 78px slot in a 246px window: 84px remain above and below — the slot is exactly centred.
    expect(centerScroll(168, 78, 246, 1000)).toBe(84);
  });

  it("the window equals the cell — scrolling exactly to its start", () => {
    expect(centerScroll(168, 78, 78, 1000)).toBe(168);
  });

  it("the first cell stands centred by the margin — the scroll is zero, not negative", () => {
    // The side padding (`stripPadding`) already centred the first cell: offset = 84.
    expect(centerScroll(84, 78, 246, 1000)).toBe(0);
  });

  it("the target does not go past the scroll maximum: there is no unreachable point", () => {
    expect(centerScroll(900, 78, 246, 300)).toBe(300);
  });
});

describe("frameWheelStep — the \"latest drop\" tile's trackpad step", () => {
  /** A gesture as a stream of events every `gapMs`, from a clean state unless one is handed in. */
  function run(
    deltas: number[],
    { gapMs = 16, from = initialFrameWheel(), at = 1000, deltaMode = 0 } = {},
  ) {
    let state = from;
    let now = at;
    const steps: number[] = [];
    for (const dx of deltas) {
      const r = frameWheelStep(state, dx, deltaMode, now);
      state = r.state;
      if (r.dir !== 0) steps.push(r.dir);
      now += gapMs;
    }
    return { steps, state, now };
  }

  /** A flick as the trackpad sends it: a burst, then a long tail decaying geometrically. */
  const flick = (peak: number, decay = 0.94, count = 60) =>
    Array.from({ length: count }, (_, i) => peak * Math.pow(decay, i));

  it("a continuous gesture pages exactly one frame", () => {
    expect(run(Array(120).fill(20)).steps).toEqual([1]);
  });

  it("one flick with inertia is worth ONE frame, not two", () => {
    // The tail outlives the burst and travels hundreds of pixels the person no longer controls.
    expect(run(flick(50)).steps).toEqual([1]);
  });

  it("a SECOND flick on the tail of the first pages again — without moving the cursor", () => {
    // The owner's complaint: after one swipe the next did nothing until the mouse was moved. The
    // tail keeps the event stream alive, so silence never comes; the new flick is told by its SIZE.
    const first = run(flick(50, 0.94, 30));
    const second = run(flick(50, 0.94, 30), { from: first.state, at: first.now });
    expect(first.steps).toEqual([1]);
    expect(second.steps).toEqual([1]);
  });

  it("a slow gesture does not lose what it accumulated in pauses within it", () => {
    // Events 100ms apart are still one gesture: only silence longer than the gap ends it.
    expect(run(Array(40).fill(8), { gapMs: 100 }).steps).toEqual([1]);
  });

  it("after a pause the next flick pages anew", () => {
    const first = run(Array(20).fill(20));
    const second = run(Array(20).fill(20), { from: first.state, at: first.now + FRAME_WHEEL_GAP_MS });
    expect(second.steps).toEqual([1]);
  });

  it("a step is worth the distance travelled, not a single event", () => {
    expect(run([FRAME_WHEEL_TRAVEL_PX - 1]).steps).toEqual([]);
    expect(run([FRAME_WHEEL_TRAVEL_PX - 1, 1]).steps).toEqual([1]);
  });

  it("direction: right is the next frame, left the previous", () => {
    expect(run([FRAME_WHEEL_TRAVEL_PX]).steps).toEqual([1]);
    expect(run([-FRAME_WHEEL_TRAVEL_PX]).steps).toEqual([-1]);
  });

  it("reversing the gesture resets the accumulation: someone who changed their mind has nothing to finish counting", () => {
    const half = run([60]);
    expect(half.state.acc).toBe(60);
    const back = frameWheelStep(half.state, -30, 0, half.now);
    expect(back.dir).toBe(0);
    expect(back.state.acc).toBe(-30);
  });

  it("a delta in lines (Firefox) is converted to pixels, otherwise the threshold is unreachable", () => {
    const lines = FRAME_WHEEL_TRAVEL_PX / 2;
    expect(run([lines], { deltaMode: 1 }).steps).toEqual([1]);
    expect(run([lines], { deltaMode: 0 }).steps).toEqual([]);
  });
});
