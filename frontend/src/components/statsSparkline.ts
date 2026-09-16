/**
 * Pure sparkline logic — window, scroll and scale, kept apart from the SVG for unit tests. The
 * window shows `size` days and `offset` is how far it has slid into the past. THE Y SCALE IS TAKEN
 * FROM THE WHOLE HISTORY, not the visible window, so point heights do not jump while scrolling.
 */

export interface SparkPoint {
  date: string;
  /** The day's metric value (steps or sleep minutes). `null` = no data, not zero. */
  value: number | null;
}

/** How far back one may page: the history's excess over the window (0 = nowhere to scroll). */
export function maxOffset(historyLen: number, size: number): number {
  return Math.max(0, historyLen - size);
}

/** Clamp the offset into the allowed range [0, maxOffset]. */
export function clampOffset(offset: number, historyLen: number, size: number): number {
  return Math.min(Math.max(0, offset), maxOffset(historyLen, size));
}

/**
 * The visible window of `size` days, moved `offset` days back from the right edge. A history
 * shorter than the window is returned whole, and the offset clamps to the history's ends.
 */
export function visibleWindow(history: SparkPoint[], size: number, offset: number): SparkPoint[] {
  if (history.length <= size) return history;
  const clamped = clampOffset(offset, history.length, size);
  const end = history.length - clamped;
  return history.slice(end - size, end);
}

/** The maximum across the whole history (a stable Y axis); gaps are ignored, minimum 1. */
export function niceMax(history: SparkPoint[]): number {
  let max = 1;
  for (const p of history) {
    if (p.value !== null && p.value > max) max = p.value;
  }
  return max;
}

/** The mean of non-empty values, rounded; `null` when there is no data. */
export function average(points: SparkPoint[]): number | null {
  let sum = 0;
  let count = 0;
  for (const p of points) {
    if (p.value !== null) {
      sum += p.value;
      count += 1;
    }
  }
  return count === 0 ? null : Math.round(sum / count);
}

export interface AxisBounds {
  min: number;
  max: number;
}

/**
 * Y bounds for the visible window, so the line lives rather than sticking to an edge. It
 * autoscales with padding, but a span smaller than `minSpan` is widened symmetrically — steady
 * days should read as a calm wave, not inflated noise. The floor never goes below zero. §7.4
 */
export function axisBounds(points: SparkPoint[], minSpan: number, padFactor = 0.15): AxisBounds {
  const values: number[] = [];
  for (const p of points) {
    if (p.value !== null) values.push(p.value);
  }
  if (values.length === 0) return { min: 0, max: Math.max(minSpan, 1) };

  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const pad = (hi - lo) * padFactor;
  lo = Math.max(0, lo - pad);
  hi = hi + pad;
  if (hi <= lo) hi = lo + 1;
  return { min: lo, max: hi };
}
