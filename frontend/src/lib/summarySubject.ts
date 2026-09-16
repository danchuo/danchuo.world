import type { PodcastEpisodeView, ReadingBookView } from "./api/types";
import { minutesLabel, stretchLabel } from "./podcastCard";
import { progressLabel } from "./readingCard";

/**
 * Coerces a board card into the summary window's subject. Book and episode share ONE window: the
 * question and the answer do not depend on which it was, only the header differs — and that
 * difference lives here as DATA rather than in a second near-identical component. PRD §5.16.1
 */

/** Whose retelling this is — the same discriminator as the backend row's (`kind`). */
export type SummaryKind = "reading" | "podcast";

/** Header of the retelling window: everything the board knows about a sitting without a request. */
export interface SummarySubject {
  kind: SummaryKind;
  /** The sitting's key, which the text itself is fetched by. */
  sessionId: number;
  /** First line of the header: the book or the episode. */
  title: string;
  /** Second line: the book's author or the show's name. `null` means there is none. */
  byline: string | null;
  coverUrl: string | null;
  /** Whether the cover is portrait: a book has a spine, an episode a square sleeve. */
  portrait: boolean;
  /** Caption above the large line — "read" or "listened" in this sitting. */
  progressCaption: string;
  /** The chunk in the subject's own language: "48% → 53%" or "35 of 48 min". `null` says nothing. */
  progressValue: string | null;
  /** What a screen reader hears in place of the header. */
  ariaLabel: string;
}

/**
 * A reading sitting as the window's subject. `null` means there is nothing to open: without a
 * sitting id the retelling cannot be requested, so the card must carry no button either.
 */
export function bookSubject(book: ReadingBookView): SummarySubject | null {
  if (book.sessionId == null) return null;
  return {
    kind: "reading",
    sessionId: book.sessionId,
    title: book.title,
    byline: book.author,
    coverUrl: book.coverUrl,
    portrait: true,
    progressCaption: "прочитано за этот заход",
    progressValue: progressLabel(book),
    ariaLabel: `Что было в прочитанном куске: ${book.title}`,
  };
}

/**
 * A listened sitting as the window's subject. The slice is measured in minutes rather than
 * fractions, yet answers the same question with the same arrow as a book's percentages. Unknown
 * bounds fall back to "how long it listened" — less than wanted, but not silence.
 */
export function episodeSubject(episode: PodcastEpisodeView): SummarySubject | null {
  if (episode.sessionId == null) return null;
  return {
    kind: "podcast",
    sessionId: episode.sessionId,
    title: episode.episodeName,
    byline: episode.showName,
    coverUrl: episode.imageUrl,
    portrait: false,
    progressCaption: "прослушано за этот заход",
    progressValue: stretchLabel(episode) ?? minutesLabel(episode.listenedMinutes, episode.durationMinutes),
    ariaLabel: `Что было в прослушанном куске: ${episode.episodeName}`,
  };
}
