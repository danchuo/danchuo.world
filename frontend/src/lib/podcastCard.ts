import type { PodcastEpisodeView } from "./api/types";

/**
 * Formulas for a listened-podcast card (PRD §5.6) — what has to be known before drawing: which
 * sitting to show at a stop, and what to say about the minutes.
 */

/**
 * The card for the stop numbered [occurrence]. Cards are handed out in order and there may be FEWER
 * of them than closed stops: marks count by the day's minutes, cards by sittings. A marathon closes
 * both stops and brings one card, and the second stop having no hover is normal, not lost data.
 */
export function episodeForStop(
  episodes: PodcastEpisodeView[] | undefined,
  occurrence: number,
): PodcastEpisodeView | null {
  return episodes?.[occurrence - 1] ?? null;
}

/**
 * The caption for the chunk, in the same role as "read" on a book card, and set in the same classes:
 * the question is one for a book and for an episode, so the setting must be one too.
 */
export const LISTENED_CAPTION = "прослушано";

/**
 * The unit for minutes in the card's captions, one for all three of them, so it cannot drift across
 * the file. It has NO element of its own in the markup: the chunk's line is coloured whole, unit
 * included, and there is nothing to split.
 */
export const MINUTES_UNIT = "мин";

/**
 * How long this sitting listened. It sits ABOVE the covered slice and quieter, answering "how much
 * in total" so nothing has to be subtracted mentally. A book needs no such line — its percentages
 * are the whole answer. There is no start time: "when did I press play" is not what a card asks.
 */
export function listenedLabel(episode: PodcastEpisodeView): string {
  return `${episode.listenedMinutes} ${MINUTES_UNIT}`;
}

/**
 * The covered slice of an episode: "45 -> 95 min". The same answer and the same arrow as a book's
 * percentages, since the question is identical and only the units differ. `null` when both bounds
 * are missing or equal — "45 -> 45" is a point, not a slice, and says nothing.
 */
export function stretchLabel(episode: PodcastEpisodeView): string | null {
  const from = episode.startMinute;
  const to = episode.endMinute;
  if (typeof from !== "number" || typeof to !== "number") return null;
  if (to <= from) return null;
  return `${from} → ${to} ${MINUTES_UNIT}`;
}

/**
 * "47 of 48 min", or simply "47 min" without a duration.
 *
 * What was listened to is clamped by the duration. A re-listened chunk honestly accumulates minutes,
 * but "49 of 48" on a card would read as a broken counter rather than as a repeat.
 */
export function minutesLabel(minutes: number, durationMinutes: number | null | undefined): string {
  if (typeof durationMinutes !== "number") return `${minutes} ${MINUTES_UNIT}`;
  return `${Math.min(minutes, durationMinutes)} из ${durationMinutes} ${MINUTES_UNIT}`;
}
