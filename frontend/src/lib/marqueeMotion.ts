/**
 * Mechanics of a marquee that can be paged by hand: it travels on its own while obeying the
 * pointer, coasts after a fling and returns to its own motion. Only the arithmetic lives here —
 * pure functions with no DOM and no time. Frames, listeners and styles are in `useMarqueeDrag`.
 */

/** Past this threshold (px) a gesture counts as a drag rather than a tap on an item. */
export const DRAG_SLOP = 6;

/** Reference frame (ms) for the decay: the coefficient below is given per 60fps frame. */
const FRAME_MS = 1000 / 60;

/** How much of a throw's speed survives one frame. */
const FLING_DECAY = 0.94;

/** Below this (px/ms ≈ 24px/s) a throw is killed: otherwise the rail crawls on for seconds, visibly
 *  slower than its own travel, which reads as stalling rather than inertia. */
export const FLING_MIN = 0.04;

/** How many of the drag's last milliseconds count as the throw. */
const FLING_WINDOW_MS = 90;

/** Ceiling on a throw (px/ms = 3000px/s). A real finger never reaches it; the ceiling guards against
 *  the CLOCK — two points landing a fraction of a millisecond apart give an honest derivative in the
 *  hundreds of px/ms, and the rail would fly dozens of copies in one frame. */
export const FLING_MAX = 3;

export interface DragSample {
  /** The sample's moment (ms). */
  t: number;
  /** The pointer's coordinate along the rail (px). */
  pos: number;
}

/**
 * The ribbon's offset within one copy of the content: the track holds two copies, so a step of a
 * whole copy is invisible and the loop is seamless. The remainder is POSITIVE on purpose — paging
 * backwards is as endless as forwards, entering from the copy's end rather than hitting an edge.
 */
export function wrapOffset(offset: number, span: number): number {
  if (!Number.isFinite(span) || span <= 0 || !Number.isFinite(offset)) return 0;
  const wrapped = offset % span;
  return wrapped < 0 ? wrapped + span : wrapped;
}

/**
 * Fling velocity from the last points of a drag. Measured over the tail rather than the whole
 * gesture: "dragged and held" is pointing at a spot, not throwing, and the ribbon must stay where
 * it was left — an average over the whole gesture would throw it onward against the hand.
 */
export function flingVelocity(samples: readonly DragSample[]): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  // The step back is always taken, even when the previous point is older than the window: two sparse
  // points are all that is known about the gesture, and refusing them would mean "there was no throw".
  let first = samples[samples.length - 2];
  for (let i = samples.length - 3; i >= 0; i--) {
    if (last.t - samples[i].t > FLING_WINDOW_MS) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  const v = (last.pos - first.pos) / dt;
  return Math.max(-FLING_MAX, Math.min(FLING_MAX, v));
}

/**
 * Decay of a throw over elapsed time. Tied to milliseconds rather than to a frame count: a 120 Hz
 * screen has twice the frames, and a per-frame multiplier would kill a throw twice as fast.
 */
export function decayVelocity(v: number, dtMs: number): number {
  const decayed = v * FLING_DECAY ** (dtMs / FRAME_MS);
  return Math.abs(decayed) < FLING_MIN ? 0 : decayed;
}

/** The rail's own travel (px/ms) from the time of a full pass of a copy — the animation's old tempo. */
export function driftSpeed(span: number, seconds: number): number {
  if (!Number.isFinite(span) || !Number.isFinite(seconds) || span <= 0 || seconds <= 0) return 0;
  return span / (seconds * 1000);
}

/** A wheel line in pixels (`deltaMode: 1`), roughly a line of the board's text. */
export const WHEEL_LINE_PX = 16;

/** A wheel page in pixels (`deltaMode: 2`), a screen of scrolling; the gesture is rare and precision
 *  is beside the point. */
export const WHEEL_PAGE_PX = 400;

/** A wheel event in as much detail as the arithmetic reads, with no DOM. */
export interface WheelLike {
  deltaX: number;
  deltaY: number;
  /** 0 is pixels, 1 lines, 2 pages (`WheelEvent.deltaMode`). */
  deltaMode: number;
}

/**
 * How far one wheel event moves the ribbon, positive meaning the direction it travels by itself.
 * The gesture's MAIN axis is taken, not the ribbon's: a mouse has no cross axis at all and a
 * trackpad's habitual gesture is vertical. A tie goes to the ribbon's own axis.
 */
export function wheelDelta(e: WheelLike, vertical: boolean): number {
  const unit = e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? WHEEL_PAGE_PX : 1;
  const along = (vertical ? e.deltaY : e.deltaX) * unit;
  const across = (vertical ? e.deltaX : e.deltaY) * unit;
  const delta = Math.abs(along) >= Math.abs(across) ? along : across;
  return Number.isFinite(delta) ? delta : 0;
}
