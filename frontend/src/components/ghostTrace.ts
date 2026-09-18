/**
 * Turning a row of daily values into SVG paths. Pure, and the whole reason it is a module: the one
 * rule worth testing here is that A GAP STAYS A GAP — a day the channel missed must not be drawn
 * as a zero, nor bridged by a line through it. DESIGN §7.4
 */

export interface TracePoint {
  x: number;
  /** `null` is a day with no value — not a zero. */
  y: number | null;
}

/** Runs of adjacent real values; a run of one cannot be a line and is left to [traceIslands]. */
function runs(pts: readonly TracePoint[]): { x: number; y: number }[][] {
  const out: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  for (const p of pts) {
    if (p.y === null) {
      if (cur.length > 0) out.push(cur);
      cur = [];
    } else {
      cur.push({ x: p.x, y: p.y });
    }
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

/** One `points` string per unbroken run of days, for one polyline each. */
export function traceSegments(pts: readonly TracePoint[]): string[] {
  return runs(pts)
    .filter((r) => r.length > 1)
    .map((r) => r.map((p) => `${p.x},${p.y}`).join(" "));
}

/**
 * Days that stand alone between two gaps. They get a DOT: a polyline needs two ends, so without
 * this the one day in a week that has a value draws nothing and the chart says the week was empty.
 */
export function traceIslands(pts: readonly TracePoint[]): { x: number; y: number }[] {
  return runs(pts)
    .filter((r) => r.length === 1)
    .map((r) => r[0]);
}

/**
 * The area under the trace, closed to `floor` — the tile's bottom EDGE, not the axis: the chart
 * lies under the caption band the way the photo lies under the drop caption (DESIGN §7.5).
 */
export function areaPath(pts: readonly TracePoint[], floor: number): string {
  return runs(pts)
    .filter((r) => r.length > 1)
    .map((r) => {
      const head = `M ${r[0].x} ${floor}`;
      const line = r.map((p) => `L ${p.x} ${p.y}`).join(" ");
      return `${head} ${line} L ${r[r.length - 1].x} ${floor} Z`;
    })
    .join(" ");
}
