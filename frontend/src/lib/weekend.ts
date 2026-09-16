/**
 * Whether an MSK date key is a weekend. The date is parsed as UTC midnight so the browser's local
 * timezone cannot shift it to a neighbouring day. On weekends the Today tile shows the rest scene
 * and discipline streaks step over the day, while the monster counts always. PRD §4, §5.6
 */
export function isWeekend(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** Waves shipping a weekend rest-scene asset (/assets/waves/<wave>/today/weekend-horizon.png).
 *  Waves without one keep the discipline quest map on weekends (graceful fallback). */
const WEEKEND_SCENE_WAVES = new Set(["wave-01"]);

/** Does this wave have a weekend rest scene? Gate for swapping the quest map on Sat/Sun. */
export function hasWeekendScene(wave?: string | null): boolean {
  return wave != null && WEEKEND_SCENE_WAVES.has(wave);
}
