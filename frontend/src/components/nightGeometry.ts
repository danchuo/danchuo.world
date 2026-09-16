import type { SleepBandView } from "@/lib/api/types";

/**
 * Night geometry: the night's segments become lanes and fractions of an axis. A pure function
 * working in FRACTIONS rather than measuring the container — there is nothing to measure, the
 * chart spans the tile, and jsdom has no ResizeObserver so a measuring component would not render.
 */

/** A band chunk's phase; `awake` is not sleep but is part of the night. */
export type SleepStageKey = "light" | "deep" | "rem" | "awake";

export interface NightBandPart {
  stage: SleepStageKey;
  /** Lane number from top to bottom — see [LANES]. */
  lane: number;
  /** Share of the axis, as a percentage. */
  left: number;
  width: number;
}

/**
 * Phase lanes from top to bottom, wakefulness down to deepest sleep. The vertical is given to
 * DEPTH deliberately: phases are ordered, and order reads by position but never by colour. Labels
 * follow Apple's Health app, since the reader has nothing else to check a lane against. §7.7
 */
export const LANES: { stage: SleepStageKey; label: string }[] = [
  { stage: "awake", label: "не спал" },
  { stage: "rem", label: "REM" },
  { stage: "light", label: "базовый" },
  { stage: "deep", label: "глубокий" },
];

const LANE_OF: Record<SleepStageKey, number> = LANES.reduce(
  (acc, lane, i) => ({ ...acc, [lane.stage]: i }),
  {} as Record<SleepStageKey, number>,
);

export interface NightBandTick {
  minute: number;
  label: string;
  left: number;
}

export interface NightBandGeometry {
  /** Axis bounds in minutes from the start of the axis day, snapped to whole hours. */
  fromMinute: number;
  toMinute: number;
  parts: NightBandPart[];
  ticks: NightBandTick[];
}

/** The MSK hour the axis starts from — the same one the backend sends in `axisStartHour`. */
const DEFAULT_AXIS_START_HOUR = 18;

/**
 * A phase's colour, from sleep's own tokens, shared by EVERY layout of the widget — one phase
 * cannot be two colours in one tile. They are its own tokens rather than board colours directly:
 * a wave may give sleep its own descent, and on a dark skin deep sleep vanished entirely.
 */
export const STAGE_COLOR: Record<SleepStageKey, string> = {
  rem: "var(--sleep-rem)",
  deep: "var(--sleep-deep)",
  light: "var(--sleep-core)",
  awake: "var(--sleep-awake)",
};

/** An axis minute → a time of day as `HH:MM`. */
export function clockLabel(minute: number, axisStartHour = DEFAULT_AXIS_START_HOUR): string {
  const clock = (axisStartHour * 60 + minute) % 1440;
  const h = Math.floor(clock / 60);
  const m = clock % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Label step: as many hours as leaves about five divisions rather than a picket fence. */
function tickStep(spanMinutes: number): number {
  if (spanMinutes <= 360) return 60;
  if (spanMinutes <= 720) return 120;
  return 180;
}

export function nightBandGeometry(
  band: SleepBandView | null | undefined,
  axisStartHour = DEFAULT_AXIS_START_HOUR,
): NightBandGeometry | null {
  if (!band || band.parts.length === 0) return null;

  // The axis is snapped to whole hours: labels must land on round times, not on 23:17.
  const from = Math.floor(band.onsetMinute / 60) * 60;
  const to = Math.ceil(band.wakeMinute / 60) * 60;
  const span = to - from;
  const pct = (minute: number) => ((minute - from) / span) * 100;

  const ticks: NightBandTick[] = [];
  for (let m = from; m <= to; m += tickStep(span)) {
    ticks.push({ minute: m, label: clockLabel(m, axisStartHour), left: pct(m) });
  }

  return {
    fromMinute: from,
    toMinute: to,
    parts: band.parts.map((p) => ({
      stage: p.stage,
      lane: LANE_OF[p.stage],
      left: pct(p.fromMinute),
      width: pct(p.toMinute) - pct(p.fromMinute),
    })),
    ticks,
  };
}
