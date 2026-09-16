import type { DaySummary } from "@/lib/api/types";
import { MONSTER_LENS_KEY } from "@/lib/disciplineLens";

/** Average all four density channels, counting missing channels as zero so partial data cannot look complete. DESIGN §5.2. */

/** Step-channel saturation threshold. */
export const STEPS_FULL = 10_000;
/** Sleep-channel saturation: eight hours. */
export const SLEEP_FULL = 480;
/** Daily contribution-channel saturation threshold. */
export const CODE_FULL = 10;

/** Channel share clamped to 0..1; missing or invalid values count as zero. */
function share(value: number | null | undefined, full: number): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value / full);
}

/** Exclude monster consumption; discipline density counts first completion even for target=2. PRD §5.6. */
function disciplineShare(counts: DaySummary["disciplineCounts"]): number {
  if (!counts) return 0;
  const keys = Object.keys(counts).filter((k) => k !== MONSTER_LENS_KEY);
  if (keys.length === 0) return 0;
  const done = keys.filter((k) => (counts[k] ?? 0) > 0).length;
  return done / keys.length;
}

/** Day density in 0..1; future and unrecorded days have zero weight. */
export function dayWeight(day: DaySummary): number {
  if (!day.hasData) return 0;
  const parts = [
    share(day.steps, STEPS_FULL),
    share(day.sleepMinutes, SLEEP_FULL),
    share(day.contributions, CODE_FULL),
    disciplineShare(day.disciplineCounts),
  ];
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}
