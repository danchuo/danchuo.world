/**
 * Calendar paging by wheel and trackpad: pure gesture arithmetic with no DOM. It turns a stream of
 * `wheel` events into week steps so the gesture's force reads through. The sources differ wildly —
 * a mouse sends rare large clicks, a trackpad dozens of small deltas — hence two branches. §5.3
 */

/**
 * The travel that earns one week. Noticeably more than a mouse click: this is the price of a step for
 * SMALL trackpad deltas, and it is what makes the gesture governable — on a short movement the window
 * stands still, on a long one it travels.
 */
export const WHEEL_STEP_PX = 90;
/**
 * The delta counted as a wheel click (Chrome sends 100px, Firefox 3 lines = 48px). A click is a
 * discrete device event: one week per click, with no remainder. There is nothing to accumulate, a
 * mouse having no intermediate positions.
 */
export const WHEEL_NOTCH_PX = 40;
/**
 * Minimum gap between steps: as long as the window's glide lives, since any faster and weeks
 * replace one another before the eye can follow. The gap DEFERS a step rather than swallowing it —
 * a swallowed one would read as sticking, the gesture happening but the window not moving.
 */
export const WHEEL_MIN_STEP_GAP_MS = 160;
/** Idle time after which the accumulator resets: lazy touches with a pause do not add up. */
export const WHEEL_IDLE_MS = 200;

export interface WheelState {
  /** Accumulated travel of the current gesture, signed px. */
  acc: number;
  /** Time of the last event, in ms. */
  lastAt: number;
  /** Time of the last step, in ms. */
  steppedAt: number;
}

export function initialWheelState(): WheelState {
  return { acc: 0, lastAt: Number.NEGATIVE_INFINITY, steppedAt: Number.NEGATIVE_INFINITY };
}

/* One "line" of a line-mode wheel (Firefox) and one "page" of a page-mode wheel, in px. */
const LINE_PX = 16;
const PAGE_PX = WHEEL_STEP_PX * 3;

/**
 * An event's travel in pixels along the dominant axis. The sign is the paging direction: positive
 * (down, or a swipe left) goes forward, negative goes back.
 */
export function wheelTravel(deltaX: number, deltaY: number, deltaMode: number): number {
  const raw = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  if (deltaMode === 1) return raw * LINE_PX;
  if (deltaMode === 2) return raw * PAGE_PX;
  return raw;
}

/** The next state and step (−1 back, +1 forward, 0 while still accumulating or awaiting the gap). */
export function wheelStep(
  state: WheelState,
  travel: number,
  now: number,
): { state: WheelState; step: -1 | 0 | 1 } {
  if (travel === 0) return { state, step: 0 };

  const dir: -1 | 1 = travel > 0 ? 1 : -1;
  // Idling and reversing reset the accumulator: adding movement to what came before a pause, or in
  // the other direction, would page by a gesture that never happened.
  const stale = now - state.lastAt > WHEEL_IDLE_MS;
  const carried = stale || Math.sign(state.acc) !== dir ? 0 : state.acc;
  const acc = Math.abs(travel) >= WHEEL_NOTCH_PX ? dir * WHEEL_STEP_PX : carried + travel;

  if (Math.abs(acc) < WHEEL_STEP_PX) {
    return { state: { ...state, acc, lastAt: now }, step: 0 };
  }
  if (now - state.steppedAt < WHEEL_MIN_STEP_GAP_MS) {
    // Exactly one deferred step accumulates: otherwise a sweeping gesture would queue up weeks and
    // the window would keep travelling after the fingers had left.
    return { state: { ...state, acc: dir * WHEEL_STEP_PX, lastAt: now }, step: 0 };
  }
  // The remainder carries into the next step, which is what tells a strong gesture from a weak one.
  return { state: { acc: acc - dir * WHEEL_STEP_PX, lastAt: now, steppedAt: now }, step: dir };
}
