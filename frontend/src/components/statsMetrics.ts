import type { DaySummary } from "@/lib/api/types";
import { formatSleepAxis, formatSleepShort, formatSteps, formatStepsAxis } from "@/lib/format";

/**
 * The metrics the stats tile can plot. ADDING ONE IS ONE ENTRY here — colour, axis floor and how
 * the number is written out — and nothing downstream counts them. DESIGN §7.4
 */

export type StatsMetricKey = "steps" | "sleep" | "git";

export interface StatsMetric {
  key: StatsMetricKey;
  label: string;
  /** A token, never a literal: the descent is a wave's to redress (DESIGN §7.4, §10.2). */
  color: string;
  /**
   * Floor of the axis span. The axis follows the visible window, and without a floor a week of
   * steady days would be stretched into a mountain range of noise.
   */
  minSpan: number;
  /** `null` is "not collected", which is NOT a zero — a real zero is a value and gets a point. */
  value: (day: DaySummary) => number | null;
  /** Written out for the band's figure. */
  format: (value: number) => string;
  /** Written out for an axis label, where there is room for two characters. */
  axis: (value: number) => string;
}

export const STATS_METRICS: StatsMetric[] = [
  {
    key: "steps",
    label: "шаги",
    color: "var(--stats-steps)",
    minSpan: 3000,
    value: (d) => d.steps,
    format: formatSteps,
    axis: formatStepsAxis,
  },
  {
    key: "sleep",
    label: "сон",
    color: "var(--stats-sleep)",
    minSpan: 90,
    value: (d) => d.sleepMinutes,
    format: formatSleepShort,
    axis: formatSleepAxis,
  },
  {
    // Contributions are a TRACE here, not the chip beside the charts: the chip stays silent on a
    // zero because it answers "was there anything", while a line is asked "how much, day by day"
    // — and an empty day is part of that answer. `null` is still a gap. PRD §5.15
    key: "git",
    // Labelled "git", not by the Russian word for contributions: that word names the unit GitHub
    // counts, which is the one thing nobody has in their head. The tool's own name is understood.
    label: "git",
    color: "var(--stats-git)",
    minSpan: 8,
    value: (d) => d.contributions,
    format: (v) => `+${Math.round(v)}`,
    axis: (v) => String(Math.round(v)),
  },
];

/** The next metric in the ring; the rail and the keyboard both step by it. */
export function nextMetric(index: number, step: number): number {
  const n = STATS_METRICS.length;
  return (index + (step % n) + n) % n;
}
