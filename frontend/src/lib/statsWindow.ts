/**
 * The activity charts' window. Unlike the calendar's it FOLLOWS THE SELECTED DAY: the board is a
 * time machine, and a reader who has gone to June expects June's charts. It moves LAZILY, only when
 * the day leaves its edges, so a jump costs one request rather than one per day. DESIGN §7.4
 */

import { addDays } from "./date";

/** The sample's depth. The chart shows 10 days at once; the rest is its scroll into the past. */
export const STATS_SPAN = 30;

/**
 * How many days remain AFTER the selected one when the window moves. With no margin, stepping
 * forward would hit the right edge immediately and refetch on every day.
 */
const TRAIL = 9;

export interface StatsRange {
  from: string;
  to: string;
}

/**
 * The charts' window for the selected day. It returns THE SAME object when there is nothing to
 * move, and the laziness rests on that: comparison by reference silences the refetch.
 */
export function statsWindow(
  selected: string,
  today: string,
  current: StatsRange | null,
): StatsRange {
  if (current && selected >= current.from && selected <= current.to) return current;

  // We never run past today: future data does not exist, and the window must end where the
  // history does. So a future day in the calendar does not move the window at all.
  const trailEnd = addDays(selected, TRAIL);
  const to = trailEnd > today ? today : trailEnd;
  const next = { from: addDays(to, -(STATS_SPAN - 1)), to };

  return current && next.from === current.from && next.to === current.to ? current : next;
}
