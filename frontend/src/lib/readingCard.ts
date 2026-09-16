import type { ReadingBookView } from "./api/types";

/**
 * Formulas for the reading card: which session to show at a stop and how to express the passage
 * covered. THERE ARE NO CLOCK TIMES on a book card, deliberately — the reader records no
 * open/close events, and the only moment we know is the sync, which lags by hours. PRD §5.16
 */

/**
 * The card for the stop numbered [occurrence]. Handed out in order, and there may be FEWER than
 * closed stops: marks count by the day's minutes, cards by sessions. An hour in one sitting closes
 * both stops and brings one card; the second having no hover is normal, as with podcasts.
 */
export function bookForStop(
  books: ReadingBookView[] | undefined,
  occurrence: number,
): ReadingBookView | null {
  return books?.[occurrence - 1] ?? null;
}

/**
 * The caption before the percentages. It is a separate string from the figures because the two are
 * SET DIFFERENTLY — the word muted, the numbers dense, as they are the card's main fact. The word
 * still counts towards the card's estimated width, or the line would run into an ellipsis.
 */
export const PROGRESS_CAPTION = "прочитано";

/**
 * The path through a book this sitting covered: "35% -> 42%". A missing start is MEANINGFUL — the
 * book reached us already begun, and a zero there would credit the owner with percentages they did
 * not pass here — so only the reached figure shows, with no arrow out of nowhere.
 */
export function progressLabel(book: ReadingBookView): string | null {
  const end = percent(book.endPercent);
  if (end === null) return null;
  const start = percent(book.startPercent);
  if (start === null || start === end) return end;
  return `${start} → ${end}`;
}

/** A 0..1 share as whole percent; `null` means unknown, which is not the same as 0%. */
function percent(value: number | null | undefined): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  // The reader stores a fraction, but 0.999 on a finished book must read as 100%, not 99.9%.
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}
