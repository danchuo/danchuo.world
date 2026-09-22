import type { ArtifactBoxView } from "./api/types";

/** Display padding per side, relative to the detection size; directs attention without tracing the contour. PRD §5.12, DESIGN §7.5. */
export const HIGHLIGHT_PAD = 0.15;

/** Minimum displayed size per axis; tiny detections remain visible without changing stored model output. DESIGN §7.5. */
export const HIGHLIGHT_MIN = 0.12;

/** Require movement on either axis so accidental clicks cannot create visible boxes. */
export const DRAG_DEADZONE = 0.01;

/** Normalized detection box sent to the backend; mirrors BoxInput. */
export interface BoxRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Normalize corner order, clamp to 0..1 and enforce the minimum size; return null for clicks. Apply padding only at render time. PRD §5.12. */
export function boxFromDrag(
  from: { x: number; y: number },
  to: { x: number; y: number },
  min: number = HIGHLIGHT_MIN,
  deadzone: number = DRAG_DEADZONE,
): BoxRect | null {
  const ax = clamp01(from.x);
  const ay = clamp01(from.y);
  const bx = clamp01(to.x);
  const by = clamp01(to.y);
  if (Math.abs(bx - ax) < deadzone && Math.abs(by - ay) < deadzone) return null;

  const [x0, x1] = atLeast(Math.min(ax, bx), Math.max(ax, bx), min);
  const [y0, y1] = atLeast(Math.min(ay, by), Math.max(ay, by), min);
  return { x0: round5(x0), y0: round5(y0), x1: round5(x1), y1: round5(y1) };
}

/** Normalized display box as origin and dimensions. */
export interface HighlightRect {
  x0: number;
  y0: number;
  width: number;
  height: number;
}

/** Pad before applying the minimum size, then clamp to the frame; changing display padding must not mutate model output. */
export function padHighlight(
  box: ArtifactBoxView,
  pad: number = HIGHLIGHT_PAD,
  min: number = HIGHLIGHT_MIN,
): HighlightRect {
  const dx = (box.x1 - box.x0) * pad;
  const dy = (box.y1 - box.y0) * pad;
  const [x0, x1] = atLeast(Math.max(0, box.x0 - dx), Math.min(1, box.x1 + dx), min);
  const [y0, y1] = atLeast(Math.max(0, box.y0 - dy), Math.min(1, box.y1 + dy), min);
  return { x0: round5(x0), y0: round5(y0), width: round5(x1 - x0), height: round5(y1 - y0) };
}

/** CSS `background-size`/`background-position` painting the frame sharply inside one find. */
export interface ShotWindow {
  size: string;
  position: string;
}

/**
 * The frame as a background of the find's own box: sized to the whole frame and shifted so the area
 * under the box lands in it. Lets a wave keep finds sharp over a blurred frame without a mask.
 */
export function shotWindow(r: HighlightRect): ShotWindow {
  return {
    size: `${pct(100 / r.width)}% ${pct(100 / r.height)}%`,
    // Percentage positioning offsets by (container - image), hence the division by the remainder.
    position: `${pct(axisPos(r.x0, r.width))}% ${pct(axisPos(r.y0, r.height))}%`,
  };
}

/**
 * One CSS mask covering the UNION of the finds. A filter laid on each find separately would apply
 * twice where two of them overlap — an inversion done twice is no inversion. DESIGN §7.5
 */
export function unionMask(rects: HighlightRect[]): string {
  return rects
    .map(
      (r) =>
        `linear-gradient(#000 0 0) ${pct(axisPos(r.x0, r.width))}% ${pct(axisPos(r.y0, r.height))}% / ` +
        `${pct(r.width * 100)}% ${pct(r.height * 100)}% no-repeat`,
    )
    .join(", ");
}

/** A box spanning the whole axis leaves nothing to shift along it, and the remainder is zero. */
function axisPos(start: number, size: number): number {
  return size >= 1 ? 0 : (start / (1 - size)) * 100;
}

function pct(v: number): number {
  return Math.round(v * 1e3) / 1e3;
}

/** Round normalized coordinates to avoid floating-point noise in CSS percentages. */
function round5(v: number): number {
  return Math.round(v * 1e5) / 1e5;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Return every rendered box under the point, including overlaps; hit-test padded display bounds, not raw detections. */
export function boxesAt<T extends ArtifactBoxView>(
    boxes: T[],
    x: number,
    y: number,
    pad: number = HIGHLIGHT_PAD,
    min: number = HIGHLIGHT_MIN,
): T[] {
  return boxes.filter((b) => {
    const r = padHighlight(b, pad, min);
    return x >= r.x0 && x <= r.x0 + r.width && y >= r.y0 && y <= r.y0 + r.height;
  });
}

/** Expand to min within 0..1; shift the whole interval inward at edges so clipping cannot violate its minimum size. */
function atLeast(a: number, b: number, min: number): [number, number] {
  const size = b - a;
  const want = Math.min(min, 1);
  if (size >= want) return [a, b];
  const grow = (want - size) / 2;
  let start = a - grow;
  if (start < 0) start = 0;
  if (start + want > 1) start = 1 - want;
  return [start, start + want];
}
