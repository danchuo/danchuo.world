import { describe, expect, it } from "vitest";
import {
  WHEEL_IDLE_MS,
  WHEEL_MIN_STEP_GAP_MS,
  WHEEL_NOTCH_PX,
  WHEEL_STEP_PX,
  initialWheelState,
  wheelStep,
  wheelTravel,
  type WheelState,
} from "./wheelPaging";

/** Runs a series of (travel, now) events and returns the steps produced. */
function run(events: Array<[travel: number, now: number]>, start: WheelState = initialWheelState()) {
  const steps: number[] = [];
  let state = start;
  for (const [travel, now] of events) {
    const r = wheelStep(state, travel, now);
    state = r.state;
    if (r.step !== 0) steps.push(r.step);
  }
  return { steps, state };
}

/** A steady stream of small trackpad deltas: `total` pixels in `delta` steps, every 16ms. */
function glide(total: number, delta: number, from = 0): Array<[number, number]> {
  const events: Array<[number, number]> = [];
  const dir = Math.sign(total);
  for (let moved = 0, t = from; moved < Math.abs(total); moved += Math.abs(delta), t += 16) {
    events.push([dir * Math.abs(delta), t]);
  }
  return events;
}

describe("wheelTravel — the dominant axis in pixels (PRD §5.3)", () => {
  it("vertical: down is forward, up is back", () => {
    expect(wheelTravel(0, 100, 0)).toBe(100);
    expect(wheelTravel(0, -100, 0)).toBe(-100);
  });

  it("the touchpad's horizontal axis pages too: swipe left (deltaX > 0) is forward", () => {
    expect(wheelTravel(60, 5, 0)).toBe(60);
    expect(wheelTravel(-60, 5, 0)).toBe(-60);
  });

  it("lines and pages (deltaMode 1/2) are converted to pixels instead of being counted as units", () => {
    // Firefox sends the wheel in lines (3 per click): unconverted, three "pixels" would not even
    // reach one notch and the wheel would page three times more stiffly than in Chrome.
    expect(Math.abs(wheelTravel(0, 3, 1))).toBeGreaterThanOrEqual(WHEEL_NOTCH_PX);
    expect(Math.abs(wheelTravel(0, 1, 2))).toBeGreaterThanOrEqual(WHEEL_NOTCH_PX);
  });
});

describe("wheelStep — a mouse click is discrete, a touchpad gesture is analogue", () => {
  it("one mouse wheel click is exactly one week, with no remainder", () => {
    expect(run([[100, 0]]).steps).toEqual([1]);
    expect(run([[-100, 0]]).steps).toEqual([-1]);
    // A click twice a week's size does not give two: a mouse has no intermediate positions.
    expect(run([[WHEEL_STEP_PX * 2, 0]]).steps).toEqual([1]);
  });

  it("the gesture's strength is felt: a short movement does not page, a long one pages further", () => {
    // The threshold is a week's price for small deltas. Below it the window stands still.
    expect(run(glide(-WHEEL_STEP_PX * 0.6, -12)).steps).toEqual([]);
    const long = run(glide(-WHEEL_STEP_PX * 3, -12)).steps;
    expect(long.length).toBeGreaterThanOrEqual(2);
    expect(long.every((s) => s === -1)).toBe(true);
  });

  it("the gesture's remainder carries over: two halves in a row give a week, like one movement", () => {
    // Otherwise the calendar "lost" the travel at every step and grew stiffer the smaller the deltas.
    const half = glide(-WHEEL_STEP_PX * 0.9, -9);
    const { state } = run(half);
    expect(Math.abs(state.acc)).toBeGreaterThan(0);
    expect(run(glide(-WHEEL_STEP_PX * 0.9, -9, 16 * half.length), state).steps).toEqual([-1]);
  });

  it("the touchpad's inertial tail finishes rolling the window instead of being swallowed", () => {
    // The tail is the gesture continuing, and it used to be swallowed whole: a broad swipe moved
    // the window exactly one week however many pixels followed it.
    const tail: Array<[number, number]> = [];
    for (let t = 16, d = 30; t < 700; t += 16, d = Math.max(2, d * 0.93)) tail.push([-d, t]);
    expect(run([[-100, 0], ...tail]).steps.length).toBeGreaterThanOrEqual(3);
  });

  it("fast wheel spinning does not outrun the fade-in: a gap holds between steps", () => {
    const { steps } = run([
      [-100, 0],
      [-100, 30],
      [-100, 60],
      [-100, 90],
    ]);
    expect(steps).toEqual([-1]);
  });

  it("a deferred step is not lost — it goes out with the first event after the gap", () => {
    const { steps } = run([
      [-100, 0],
      [-100, 30],
      [-5, WHEEL_MIN_STEP_GAP_MS + 1],
    ]);
    expect(steps).toEqual([-1, -1]);
  });

  it("the deferred queue does not grow: the gesture ended — the window stopped", () => {
    // Otherwise fingers lifted off the trackpad left the calendar coasting on the accumulated travel.
    const flick: Array<[number, number]> = [];
    for (let i = 0; i < 12; i++) flick.push([-100, i * 10]);
    const { state } = run(flick);
    expect(Math.abs(state.acc)).toBeLessThanOrEqual(WHEEL_STEP_PX);
  });

  it("the accumulation resets after idling: two lazy touches with a pause do not add up", () => {
    const { steps } = run([
      [-30, 0],
      [-30, WHEEL_IDLE_MS + 1],
    ]);
    expect(steps).toEqual([]);
  });

  it("a direction change does not inherit an accumulation of the other sign", () => {
    const { steps } = run([...glide(-WHEEL_STEP_PX * 0.9, -9), ...glide(WHEEL_STEP_PX * 0.9, 9, 200)]);
    expect(steps).toEqual([]);
  });

  it("zero movement changes nothing", () => {
    const state = initialWheelState();
    expect(wheelStep(state, 0, 10)).toEqual({ state, step: 0 });
  });
});
