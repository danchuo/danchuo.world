/**
 * Geometry of the "reel" — the drop gallery edition where frames travel as one rail (DESIGN §7.5).
 * Pure functions: the rail lives in the browser, but its arithmetic is checked without a DOM.
 */

/**
 * The frame whose centre is nearest the ribbon window's middle. The ribbon's scroll position is the
 * single source of truth. A tie goes to the EARLIER frame, or the index would jitter back and
 * forth on a fractional pixel of scroll.
 */
export function nearestFrameIndex(centers: number[], mid: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < centers.length; i += 1) {
    const distance = Math.abs(centers[i] - mid);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * Which frame to open the reel on. The tile's frame edition shows ONE photo, so opening at the
 * start would lose the very frame that was clicked. Identified by image ADDRESS rather than index —
 * the address is the frame's identity — and any variant will do, web or thumb.
 */
export function startFrameIndex(
  photos: readonly { imageUrl: string; thumbUrl?: string }[],
  startAt?: string | null,
): number {
  if (!startAt) return 0;
  const found = photos.findIndex((p) => p.imageUrl === startAt || p.thumbUrl === startAt);
  return found >= 0 ? found : 0;
}

/**
 * The ribbon's side padding: half a window minus half a frame. Without it the OUTERMOST frames are
 * unreachable — with centre snapping the ribbon reaches its end while the window's centre holds a
 * frame half a window in. The padding makes maximum scroll mean exactly "the last frame".
 */
export function stripPadding(viewportW: number, itemW: number): number {
  return Math.max(0, (viewportW - itemW) / 2);
}

/** Wheel delta at which an event counts as a MOUSE CLICK (browsers send ~100px per click). */
const WHEEL_NOTCH = 50;
/** How much small trackpad delta to accumulate for one frame. */
const WHEEL_STEP = 40;
/** A delta in lines (`deltaMode: 1`, Firefox on a mouse), expressed in pixels. */
const LINE_PX = 16;

/** The wheel's decision: how many frames to step, and what is left in the accumulator. */
export interface WheelDecision {
  dir: -1 | 0 | 1;
  acc: number;
}

/**
 * One wheel event's step through the reel: "not one frame per movement, but a frame per click".
 * Mouse and trackpad are told apart BY EVENT SIZE, not device type, which browsers do not report:
 * a mouse click is one large delta worth one frame, trackpad dribbles accumulate to a threshold.
 */
export function wheelStep(deltaX: number, deltaY: number, deltaMode: number, acc: number): WheelDecision {
  const k = deltaMode === 1 ? LINE_PX : 1;
  const raw = (Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX) * k;
  if (raw === 0) return { dir: 0, acc };
  if (Math.abs(raw) >= WHEEL_NOTCH) return { dir: Math.sign(raw) as -1 | 1, acc: 0 };
  const next = Math.sign(raw) === Math.sign(acc) || acc === 0 ? acc + raw : 0;
  if (Math.abs(next) >= WHEEL_STEP) return { dir: Math.sign(next) as -1 | 1, acc: 0 };
  return { dir: 0, acc: next };
}

/** How much travel (px) a trackpad must gather for ONE frame of the latest-drop tile. */
export const FRAME_WHEEL_TRAVEL_PX = 220;

/**
 * The drop tile's step on a horizontal wheel. A gesture spends at most one frame; the caller
 * clears [spent] only after the wheel stream becomes quiet, which is the browser's only signal
 * that fingers left a trackpad.
 */
export function frameWheelStep(
  deltaX: number,
  deltaMode: number,
  acc: number,
  spent: boolean,
): WheelDecision {
  if (spent) return { dir: 0, acc: 0 };
  const dx = deltaX * (deltaMode === 1 ? LINE_PX : 1);
  if (dx === 0) return { dir: 0, acc };
  const next = acc !== 0 && Math.sign(dx) !== Math.sign(acc) ? dx : acc + dx;
  if (Math.abs(next) < FRAME_WHEEL_TRAVEL_PX) return { dir: 0, acc: next };
  return { dir: next > 0 ? 1 : -1, acc: 0 };
}

/**
 * The neighbouring frame within a drop, **without wrapping**: on the first frame a step back and on
 * the last a step forward lead nowhere. Wrapping would lie about the content — a drop is a film with
 * a beginning and an end, not a carousel.
 */
export function stepFrameIndex(index: number, dir: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index + dir));
}

/**
 * Drag threshold (px) past which a finger is worth one frame. Less and the rail breaks loose at a
 * tremor of the hand; more and paging through a drop becomes work.
 */
export const SWIPE_NOTCH = 56;

/**
 * The ribbon's step when the FRAME itself is dragged by finger. On a phone the comb and strip are
 * millimetre targets, so the largest object on screen takes the gesture too. A finger moving LEFT
 * carries the ribbon forward, the way a sheet of paper follows its left edge.
 */
export function swipeStep(deltaX: number, acc: number): WheelDecision {
  const next = acc + deltaX;
  if (Math.abs(next) < SWIPE_NOTCH) return { dir: 0, acc: next };
  const dir = next < 0 ? 1 : -1;
  return { dir, acc: next < 0 ? next + SWIPE_NOTCH : next - SWIPE_NOTCH };
}

/**
 * A tooth's height under the comb's magnet: the nearer the cursor, the taller. The falloff is
 * COSINE SQUARED, not linear — linear leaves a sharp angle at the cursor and a visible kink at the
 * radius. [base] differs per tooth, and the magnet must RAISE the current frame, never flatten it.
 */
export function toothHeight(distance: number, radius: number, base: number, peak: number): number {
  if (radius <= 0) return base;
  const d = Math.min(radius, Math.abs(distance));
  const k = Math.cos((d / radius) * (Math.PI / 2));
  return base + (peak - base) * k * k;
}

/**
 * The tooth under a point of the row. The row is equal shares across its width, so a hit is a
 * fraction rather than a search through measurements — measuring 37 teeth one by one would cost a
 * layout pass per pixel of movement. Overshooting an edge returns the outermost tooth.
 */
export function tickIndexAt(pointerX: number, rowW: number, count: number): number {
  if (rowW <= 0 || count <= 0) return 0;
  const i = Math.floor((pointerX / rowW) * count);
  return Math.max(0, Math.min(count - 1, i));
}

/** Closer than this (px) the rail counts as ARRIVED: splitting half a pixel further is pointless. */
export const ROLL_SETTLE_PX = 0.5;
/**
 * What share of the remaining distance the rail covers per painted frame (60 Hz) when one frame
 * behind. This is the REEL's default; a rail may take its own stickiness through [rollMotionStep] —
 * in the archive carousel the frame is large and vertical, and the same share reads too brisk.
 */
const MOTION_RATE_BASE = 0.20;
/** Addition to the share for each frame of lag beyond the first. */
const MOTION_RATE_PER_CELL = 0.05;
/** Ceiling on the share: even a distant target is reached by movement rather than a jump. */
const MOTION_RATE_MAX = 0.5;
/** One painted frame at 60 Hz, in ms. */
const FRAME_MS = 1000 / 60;
/** No more than this many frames counted per step: a stalled frame is no reason to jump. */
const MAX_FRAMES_PER_STEP = 2;

/**
 * One rendered frame of the ribbon's own motion towards its target. Native smooth scrolling ABORTS
 * and restarts on every call, which made a burst of clicks move in lurches. Here the TARGET moves,
 * the ribbon closes on it exponentially, and speed builds while you scroll instead of resetting.
 */
export function rollMotionStep(
  pos: number,
  goal: number,
  dtMs: number,
  cellW: number,
  rateBase: number = MOTION_RATE_BASE,
): number {
  const gap = goal - pos;
  if (Math.abs(gap) <= ROLL_SETTLE_PX) return goal;
  const cellsBehind = cellW > 0 ? Math.abs(gap) / cellW : 0;
  const rate = Math.min(MOTION_RATE_MAX, rateBase + Math.max(0, cellsBehind - 1) * MOTION_RATE_PER_CELL);
  const frames = Math.min(MAX_FRAMES_PER_STEP, Math.max(0, dtMs) / FRAME_MS);
  return pos + gap * (1 - Math.pow(1 - rate, frames));
}

/**
 * The scroll position that puts a cell exactly in the window's middle, CLAMPED to the reachable.
 * One arithmetic for both ribbons and every reason to move. The clamp is required at BOTH ends, or
 * the ribbon's own motion would travel forever towards a point it can never reach.
 */
export function centerScroll(offset: number, itemSize: number, windowSize: number, maxScroll: number): number {
  return Math.max(0, Math.min(maxScroll, offset - (windowSize - itemSize) / 2));
}
