/** Bouldering on the day sheet: a figure beside the monster on the days it happened. DESIGN §4.3 */

import type { DayView } from "./api/types";

export function showsBoulder(day: DayView): boolean {
  return day.bouldered === true;
}

/**
 * Local-stack demo while the backend does not send `bouldered`: today counts as a bouldering day.
 * A real answer from the backend always wins. Remove with the flag once the field ships.
 */
export function withDemoBouldering(day: DayView, demo: boolean, today: string): DayView {
  if (!demo || day.date !== today || day.bouldered != null) return day;
  return { ...day, bouldered: true };
}
