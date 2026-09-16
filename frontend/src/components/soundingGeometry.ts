import type { SleepBandView, SleepStagesView } from "@/lib/api/types";
import { LANES, type SleepStageKey } from "./nightGeometry";

/**
 * Geometry of the echo sounder edition. The load-bearing idea: BOTH MODES SHOW THE SAME BARS, and
 * switching re-sorts rather than swapping the picture, so the area of each colour is preserved by
 * construction. Computed in viewBox coordinates, so the container is never measured. DESIGN §7.7
 */

/** A phase's depth is its lane in [LANES]: the order of phases is one for every edition. */
const DEPTH_OF: Record<SleepStageKey, number> = LANES.reduce(
  (acc, lane, i) => ({ ...acc, [lane.stage]: i }),
  {} as Record<SleepStageKey, number>,
);

/** How many horizons the sounding has — one per phase. */
const DEPTHS = LANES.length;

/**
 * How many bars the survey holds. The unit of the drawing is a BAR, not a minute, and that is
 * load-bearing: a seven-hour night would give a minute thinner than a pixel, and sub-pixel columns
 * render as moire rather than mass. The count is tuned so a bar stays about four pixels. §10.2
 */
const BRICKS = 64;

/** The drawing's coordinate system. The height is not a tile proportion but a convenient scale. */
export const ECHO_VIEW = { width: 1000, height: 600 } as const;

/**
 * Surface and floor as fractions of the height. The floor reaches UNDER the caption band's feather
 * but not under the text itself: the night lies beneath the caption as a photo does in the drop
 * tile, while the deepest horizon — the very phase this is drawn for — stays readable.
 */
const TOP = ECHO_VIEW.height * 0.05;
const BOTTOM = ECHO_VIEW.height * 0.73;
const ROW_H = (BOTTOM - TOP) / DEPTHS;

/** A bar's height in the summary, as a share of its horizon. Below half it read as a ruler, not a mass. */
const BAR_H = ROW_H * 0.62;

/**
 * How much of its step a bar occupies; the remainder is a DELIBERATE gap, so the courses read as
 * masonry rather than a solid fill and the re-sort is visible piece by piece. It must be a fraction
 * of the step, not viewBox units: the drawing stretches horizontally and a fixed gap would drift.
 */
const BRICK_FILL = 0.82;

export interface EchoBrick {
  stage: SleepStageKey;
  /** The bar's place in the night. */
  index: number;
  /** The bar's place WITHIN its own phase, which is what the summary is built from. */
  rank: number;
}

export interface EchoNight {
  bricks: EchoBrick[];
  /** Night totals in MINUTES rather than bars: the caption is computed from data, not the drawing. */
  totals: Record<SleepStageKey, number>;
  /** Sleep without wakings — the same number as the day's `sleepMinutes` (DESIGN §7.7). */
  asleep: number;
  /**
   * Whether the night has a chronology. A night with no stored chunks (the watch gave only totals)
   * knows just its sum, so there is nothing to switch and the edition stays in one mode.
   */
  timed: boolean;
}

/** The night by minutes from stored chunks. No chunks ⇒ `null`. */
export function echoNight(band: SleepBandView | null | undefined): EchoNight | null {
  if (!band || band.parts.length === 0) return null;
  const stages: SleepStageKey[] = [];
  for (const part of band.parts) {
    for (let m = part.fromMinute; m < part.toMinute; m++) stages.push(part.stage);
  }
  return build(stages, true);
}

/**
 * A night from totals alone: a phase's minutes run consecutively. There is no chronology here and
 * never will be — the order is not "approximate" but functional, needed only to assemble the bars.
 */
export function echoNightFromStages(stages: SleepStagesView | null | undefined): EchoNight | null {
  if (!stages) return null;
  const order: SleepStageKey[] = [];
  for (const lane of LANES) {
    const minutes = minutesOf(stages, lane.stage);
    for (let m = 0; m < minutes; m++) order.push(lane.stage);
  }
  return build(order, false);
}

function minutesOf(stages: SleepStagesView, stage: SleepStageKey): number {
  return Math.max(0, Math.round(stages[stage] ?? 0));
}

function tally(stages: SleepStageKey[], from = 0, to = stages.length): Record<SleepStageKey, number> {
  const out: Record<SleepStageKey, number> = { awake: 0, rem: 0, light: 0, deep: 0 };
  for (let i = from; i < to; i++) out[stages[i]] += 1;
  return out;
}

function build(stages: SleepStageKey[], timed: boolean): EchoNight | null {
  const totals = tally(stages);
  const asleep = totals.rem + totals.light + totals.deep;
  if (asleep <= 0) return null;
  const seen: Record<SleepStageKey, number> = { awake: 0, rem: 0, light: 0, deep: 0 };
  const bricks = lay(stages, totals).map((stage, index) => ({ stage, index, rank: seen[stage]++ }));
  return { bricks, totals, asleep, timed };
}

/**
 * Laying the night: minutes reduce to [BRICKS] bars. Bars per phase are decided by QUOTA on
 * largest remainders, not by whichever won a window — so a phase that earned half a bar cannot
 * vanish. Plain per-window voting loses that: wakings are short and scattered and each loses alone.
 */
function lay(stages: SleepStageKey[], totals: Record<SleepStageKey, number>): SleepStageKey[] {
  const count = Math.min(stages.length, BRICKS);
  if (count === stages.length) return stages;

  const exact = LANES.map((lane) => (totals[lane.stage] * count) / stages.length);
  const left: Record<SleepStageKey, number> = { awake: 0, rem: 0, light: 0, deep: 0 };
  LANES.forEach((lane, i) => {
    left[lane.stage] = Math.floor(exact[i]);
  });
  const whole = LANES.reduce((sum, lane) => sum + left[lane.stage], 0);
  LANES.map((lane, i) => ({ stage: lane.stage, frac: exact[i] - Math.floor(exact[i]) }))
    .sort((a, b) => b.frac - a.frac)
    .slice(0, count - whole)
    .forEach((s) => {
      left[s.stage] += 1;
    });

  const out: SleepStageKey[] = [];
  for (let i = 0; i < count; i++) {
    const window = tally(
      stages,
      Math.floor((i * stages.length) / count),
      Math.floor(((i + 1) * stages.length) / count),
    );
    let pick = LANES[0].stage;
    let best = -1;
    for (const lane of LANES) {
      if (left[lane.stage] > 0 && window[lane.stage] > best) {
        pick = lane.stage;
        best = window[lane.stage];
      }
    }
    left[pick] -= 1;
    out.push(pick);
  }
  return out;
}

/** One bar's column: the chronology rectangle plus what it becomes in the summary. */
export interface EchoColumn {
  stage: SleepStageKey;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Shift to the right, putting the column in its place in the summary. */
  shift: number;
  /** Vertical squeeze to the floor of its horizon, turning a column into a bar. */
  squash: number;
}

export interface EchoGeometry {
  columns: EchoColumn[];
  /** Depth horizons, engraved: without them an empty level is lost. */
  floors: number[];
  /** The night's floor profile (`points` for a polyline). A step function, hence a point per chunk. */
  profile: string;
}

export function echoGeometry(night: EchoNight): EchoGeometry {
  const count = night.bricks.length;
  const pitch = ECHO_VIEW.width / count;
  const floorOf = (stage: SleepStageKey) => TOP + (DEPTH_OF[stage] + 1) * ROW_H;

  const columns = night.bricks.map(({ stage, index, rank }) => {
    const floor = floorOf(stage);
    const height = floor - TOP;
    return {
      stage,
      x: index * pitch,
      y: TOP,
      width: pitch * BRICK_FILL,
      height,
      shift: (rank - index) * pitch,
      squash: BAR_H / height,
    };
  });

  const floors = LANES.map((_, i) => TOP + (i + 1) * ROW_H);

  // The profile is a step function: inside a chunk the floor does not change, so a point is placed only
  // at a phase boundary. Fifty points instead of five hundred, and the drawing is identical.
  const points: string[] = [];
  night.bricks.forEach(({ stage, index }) => {
    const floor = floorOf(stage);
    const isEdge = index === 0 || night.bricks[index - 1].stage !== stage;
    if (isEdge) points.push(`${round(index * pitch)},${round(floor)}`);
    if (index === count - 1 || night.bricks[index + 1].stage !== stage) {
      points.push(`${round((index + 1) * pitch)},${round(floor)}`);
    }
  });

  return { columns, floors, profile: points.join(" ") };
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
