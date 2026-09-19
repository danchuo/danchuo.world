import type { PodcastEpisodeView, ReadingBookView } from "./api/types";
import { MINUTES_UNIT, minutesLabel, stretchLabel } from "./podcastCard";
import { progressLabel } from "./readingCard";

/**
 * Coerces a board card into the summary window's subject. Book and episode share ONE window: the
 * question and the answer do not depend on which it was, only the header differs — and that
 * difference lives here as DATA rather than in a second near-identical component. PRD §5.16.1
 */

/** Whose retelling this is — the same discriminator as the backend row's (`kind`). */
export type SummaryKind = "reading" | "podcast";

/** A sitting's place in the whole work, both ends as 0..1 fractions. */
export interface SittingSpan {
  from: number;
  to: number;
}

/** The run's ends as they are printed, each carrying its unit: `12 min` … `47 min`. */
export interface SpanEnds {
  from: string;
  to: string;
}

/** Header of the retelling window: everything the board knows about a sitting without a request. */
export interface SummarySubject {
  kind: SummaryKind;
  /** The sitting's key, which the text itself is fetched by. */
  sessionId: number;
  /** First line of the header: the book or the episode. */
  title: string;
  /** Second line: the book's author or the show's name. `null` means there is none. */
  byline: string | null;
  /**
   * Where the subject itself lives — an episode's page at Spotify. `null` when it has no address
   * of its own, as a book on the shelf has not: then the header is text, not a door.
   */
  titleUrl: string | null;
  /** Where [byline] leads: the show's page. `null` for the same reason as [titleUrl]. */
  bylineUrl: string | null;
  coverUrl: string | null;
  /** Whether the cover is portrait: a book has a spine, an episode a square sleeve. */
  portrait: boolean;
  /** Caption above the large line — "read" or "listened" in this sitting. */
  progressCaption: string;
  /** The chunk in the subject's own language: "48% → 53%" or "35 of 48 min". `null` says nothing. */
  progressValue: string | null;
  /**
   * Where in the whole work the sitting fell, for the lit run (DESIGN §4.3). `null` when the
   * work's length is unknown and there is nothing to place the run on.
   */
  span: SittingSpan | null;
  /**
   * The numbers standing at the run's ends, for a window that DRAWS the chunk rather than
   * spelling it out. `null` exactly where [span] is null — there are no ends without a run.
   */
  spanEnds: SpanEnds | null;
  /** What a screen reader hears in place of the header. */
  ariaLabel: string;
}

/** Book percentages are already 0..1; an unknown start means the visit has no place to sit. */
export function bookSpan(book: ReadingBookView): SittingSpan | null {
  const { startPercent: from, endPercent: to } = book;
  if (typeof from !== "number" || typeof to !== "number") return null;
  return orderedSpan(from, to);
}

/** Episode minutes become fractions of its length; without a length there is nothing to divide by. */
export function episodeSpan(episode: PodcastEpisodeView): SittingSpan | null {
  const { startMinute: from, endMinute: to, durationMinutes: duration } = episode;
  if (typeof from !== "number" || typeof to !== "number") return null;
  if (typeof duration !== "number" || duration <= 0) return null;
  return orderedSpan(from / duration, to / duration);
}

/** The ends printed from the span itself, so they never disagree with the run that is drawn. */
function endsOf(span: SittingSpan | null, print: (fraction: number) => string): SpanEnds | null {
  return span ? { from: print(span.from), to: print(span.to) } : null;
}

/** Both ends into 0..1 and in order; a backwards pair is a broken reading, not a negative span. */
function orderedSpan(from: number, to: number): SittingSpan {
  const a = Math.min(Math.max(from, 0), 1);
  const b = Math.min(Math.max(to, 0), 1);
  return a <= b ? { from: a, to: b } : { from: b, to: a };
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
    titleUrl: null,
    bylineUrl: null,
    coverUrl: book.coverUrl,
    portrait: true,
    progressCaption: "прочитано за этот заход",
    progressValue: progressLabel(book),
    span: bookSpan(book),
    spanEnds: endsOf(bookSpan(book), (f) => `${Math.round(f * 100)}%`),
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
    titleUrl: episode.episodeUrl,
    bylineUrl: episode.showUrl,
    coverUrl: episode.imageUrl,
    portrait: false,
    progressCaption: "прослушано за этот заход",
    progressValue: stretchLabel(episode) ?? minutesLabel(episode.listenedMinutes, episode.durationMinutes),
    span: episodeSpan(episode),
    // The minutes are the sitting's OWN, not the fractions read back: rounding a fraction by the
    // duration drifts by a minute, and the card beside it prints the raw ones.
    spanEnds: episodeSpan(episode)
      ? { from: `${episode.startMinute} ${MINUTES_UNIT}`, to: `${episode.endMinute} ${MINUTES_UNIT}` }
      : null,
    ariaLabel: `Что было в прослушанном куске: ${episode.episodeName}`,
  };
}
