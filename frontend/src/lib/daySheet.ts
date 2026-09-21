import type { DayView, DisciplineItemView } from "./api/types";
import { weekdayLongRu } from "./date";
import { MONSTER_LENS_KEY, STREAK_SHOWN_FROM } from "./disciplineLens";
import { minutesLabel, stretchLabel } from "./podcastCard";
import { progressLabel } from "./readingCard";
import { pluralDays, relativeDayRu } from "./relativeDay";
import {
  bookSpan,
  bookSubject,
  episodeSpan,
  episodeSubject,
  type SittingSpan,
  type SummaryKind,
  type SummarySubject,
} from "./summarySubject";

/**
 * The "contact sheet" edition of the day (DESIGN §4.3): the pure transformations behind it. A
 * sitting is the unit here, not an item — two readings of one book are two cards, because each
 * covered its own chunk and earned its own retelling.
 */

/** One sitting as a frame of the sheet. `subject` is `null` when there is no retelling to open. */
export interface SheetSession {
  key: string;
  kind: SummaryKind;
  title: string;
  byline: string | null;
  coverUrl: string | null;
  /** A book has a spine, an episode a square sleeve — the frame's aspect follows. */
  portrait: boolean;
  /** The covered chunk in the kind's own units; `null` when the bounds say nothing. */
  chunk: string | null;
  minutes: number;
  /**
   * Where in the whole work this sitting fell, as two 0..1 fractions — the track under the cover
   * (DESIGN §4.3). `null` when the work's length is unknown and there is nothing to place it on.
   */
  span: SittingSpan | null;
  /** The retelling to open; `null` when there is none, and then the frame is not a button. */
  subject: SummarySubject | null;
  /**
   * Where the sitting itself lives — an episode's page at Spotify. A frame with no retelling to
   * open still leads THERE rather than being a dead picture. A book on the shelf has no address.
   */
  href: string | null;
  /** Sort key: ISO start of the visit, `null` when the source never recorded one. */
  startedAt: string | null;
}

/**
 * What a socket says about its item, and the whole of what it says: obligation is IN the verb.
 * `framed` is an item whose sittings are already frames above; `extra` happened while being owed
 * to nobody; `unreported` has simply nothing to say, which for an optional item is not a miss.
 */
export type SheetCellState = "framed" | "done" | "pending" | "extra" | "unreported";

/** One discipline item in the sheet's FIXED socket row (DESIGN §4.3). */
export interface SheetCell {
  /** Also the discipline lens's key, since the socket is what turns the lens on. */
  key: string;
  label: string;
  short: string;
  state: SheetCellState;
  /** The socket's numeral: today's part of the target, the live run, or both. */
  tail: string | null;
  streak: number;
}

/** The monster's three states (PRD §5.6); an unreported day is not a clean one. */
export type MonsterVerdict = "clean" | "drunk" | "unreported";

export interface SheetMonster {
  verdict: MonsterVerdict;
  streak: number;
}

/** The monster's card beside the frames: the 3D figure, and under it the verdict spelled out. */
export interface SheetMonsterCard {
  verdict: MonsterVerdict;
  /** Always a word: an unreported day says so rather than leaving the line empty. */
  caption: string;
  ariaLabel: string;
}

/** The headline in the canvas ribbon's grammar: weekday and day.month, relative word, day name. */
export interface SheetHeadline {
  stamp: string;
  relative: string;
  title: string | null;
}

/**
 * Every sitting of the day as frames, in the order they HAPPENED: both a book visit and an episode
 * carry `startedAt`, so podcast and book interleave the way the day went. A visit whose source
 * never recorded a start keeps its place at the end rather than jumping to the front.
 */
export function sheetSessions(day: DayView): SheetSession[] {
  const frames: SheetSession[] = [];
  for (const item of day.discipline) {
    (item.episodes ?? []).forEach((episode, i) => {
      frames.push({
        key: `podcast:${item.key}:${episode.sessionId ?? `x${i}`}`,
        kind: "podcast",
        title: episode.episodeName,
        byline: episode.showName,
        coverUrl: episode.imageUrl,
        portrait: false,
        chunk: stretchLabel(episode) ?? minutesLabel(episode.listenedMinutes, episode.durationMinutes),
        minutes: episode.listenedMinutes,
        span: episodeSpan(episode),
        subject: openableSubject(episodeSubject(episode), episode.hasSummary),
        href: episode.episodeUrl,
        startedAt: episode.startedAt ?? null,
      });
    });
    (item.books ?? []).forEach((book, i) => {
      frames.push({
        key: `reading:${item.key}:${book.sessionId ?? `x${i}`}`,
        kind: "reading",
        title: book.title,
        byline: book.author,
        coverUrl: book.coverUrl,
        portrait: true,
        chunk: progressLabel(book),
        minutes: book.readMinutes,
        span: bookSpan(book),
        subject: openableSubject(bookSubject(book), book.hasSummary),
        href: null,
        startedAt: book.startedAt ?? null,
      });
    });
  }
  return frames.sort(byStart);
}

/** Timed visits first, in time order; untimed ones hold their place at the end (stable sort). */
function byStart(a: SheetSession, b: SheetSession): number {
  if (a.startedAt === b.startedAt) return 0;
  if (a.startedAt === null) return 1;
  if (b.startedAt === null) return -1;
  return a.startedAt < b.startedAt ? -1 : 1;
}

/**
 * A retelling that does not exist is not a door. A sitting can have an id and no summary — a
 * podcast whose text never assembled — and opening an empty window on it promises nothing.
 */
function openableSubject(subject: SummarySubject | null, hasSummary?: boolean): SummarySubject | null {
  return hasSummary === true ? subject : null;
}

/**
 * Names inside the sockets. The stored labels are whole sentences and a socket is narrow; the
 * same shortening the trail map keeps for its stops (§4.1). An item the map does not know keeps
 * its own label — a new item gets a name, not a blank.
 */
const SHEET_SHORT: Readonly<Record<string, string>> = {
  stretch: "растяжка",
  reading: "чтение",
  podcasts: "подкасты",
  journal: "дневник",
  office: "офис",
  monster: "монстр",
};

/** The socket's name: the short form where there is one, the stored label otherwise. */
export function sheetShortLabel(key: string, label: string): string {
  return SHEET_SHORT[key] ?? label;
}

/**
 * The FIXED socket row: every item keeps its socket every day, in the stored order, so the row's
 * shape is learnt by eye and an empty socket is a PLACE rather than a miss. The monster is absent:
 * it is a body, not a count, and carries its own card among the frames. DESIGN §4.3
 */
export function sheetCells(day: DayView): SheetCell[] {
  return day.discipline
    .filter((item) => item.key !== MONSTER_LENS_KEY)
    .map((item) => ({
      key: item.key,
      label: item.label,
      short: sheetShortLabel(item.key, item.label),
      state: cellState(item),
      tail: cellTail(item),
      // The headline streak is the FIRST occurrence: "how many days running at all", not "twice".
      streak: item.occurrenceStreaks?.[0] ?? 0,
    }));
}

/**
 * Obligation lives in the VERB, not in a second channel: an owed item is `done` or still `pending`,
 * a goalless one either happened (`extra`) or has nothing to say, which is never a failure.
 */
function cellState(item: DisciplineItemView): SheetCellState {
  if ((item.episodes?.length ?? 0) > 0 || (item.books?.length ?? 0) > 0) return "framed";
  if (item.target <= 0) return item.count > 0 ? "extra" : "unreported";
  return item.count >= item.target ? "done" : "pending";
}

/** Today's part of the target and the run that is still alive, in that order of news. */
function cellTail(item: DisciplineItemView): string | null {
  const parts: string[] = [];
  if (item.target > 1 && item.count > 0 && item.count < item.target) {
    parts.push(`${item.count}/${item.target}`);
  }
  const streak = item.occurrenceStreaks?.[0] ?? 0;
  if (streak >= STREAK_SHOWN_FROM) parts.push(`${streak}д`);
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * The monster's own card among the frames: the figure carries it, and the caption says the whole
 * verdict in words. A day with no record says NOTHING — a silent monster is not a clean one
 * (PRD §5.6), and inventing a caption for it would be the one lie the card could tell.
 */
export function sheetMonsterCard(day: DayView): SheetMonsterCard {
  const { verdict, streak } = sheetMonster(day);
  if (verdict === "drunk") return { verdict, caption: "пил", ariaLabel: "Монстр: выпит сегодня" };
  // An empty line under the figure read as a defect rather than as silence; the card now NAMES the
  // silence. It still invents no verdict — "no data" is not "did not drink" (PRD §5.6).
  if (verdict === "unreported")
    return { verdict, caption: "данных нет", ariaLabel: "Монстр: не отмечен" };
  const caption =
    streak >= STREAK_SHOWN_FROM ? `${streak} ${pluralDays(streak)} не пил` : "не пил";
  return { verdict, caption, ariaLabel: `Монстр: ${caption}` };
}

/** The monster's verdict for the day. A drunk day breaks the run, so its streak reads zero. */
export function sheetMonster(day: DayView): SheetMonster {
  const drunk = day.monsterDrunk ?? null;
  if (drunk === null) return { verdict: "unreported", streak: day.monsterCleanStreak ?? 0 };
  if (drunk) return { verdict: "drunk", streak: 0 };
  return { verdict: "clean", streak: day.monsterCleanStreak ?? 0 };
}

/**
 * The day's line in the canvas ribbon's own grammar (§10.2) rather than a header of its own. The
 * year is absent for the ribbon's reason: the calendar is always next to it on the board.
 */
export function sheetHeadline(day: DayView, today: string): SheetHeadline {
  const iso = day.date;
  return {
    // The weekday is spelled OUT: the foot strip is the tile's full width, so an abbreviation
    // saves nothing, and a whole word is read where two letters have to be decoded.
    stamp: `${weekdayLongRu(iso)} ${iso.slice(8, 10)}.${iso.slice(5, 7)}`,
    relative: relativeDayRu(iso, today),
    title: day.title,
  };
}

/**
 * The monster's figure inside its square, as fractions of it. Measured on the live board: the can
 * holds this box at any yaw, being a cylinder, so one rectangle is an honest silhouette.
 */
const FIGURE = { left: 0.2, top: 0.04, right: 0.8, bottom: 0.96 };

/** Is the pointer on the FIGURE rather than on the canvas around it? DESIGN §4.3 */
export function onMonsterFigure(
  box: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
): boolean {
  // A square with no size yet (the tile is still laying out) owns no point at all.
  if (box.width <= 0 || box.height <= 0) return false;
  const u = (x - box.left) / box.width;
  const v = (y - box.top) / box.height;
  return u >= FIGURE.left && u <= FIGURE.right && v >= FIGURE.top && v <= FIGURE.bottom;
}
