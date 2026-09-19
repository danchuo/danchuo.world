import type { DayView, DisciplineItemView } from "./api/types";
import { weekdayShortRu } from "./date";
import { MONSTER_LENS_KEY } from "./disciplineLens";
import { minutesLabel, stretchLabel } from "./podcastCard";
import { progressLabel } from "./readingCard";
import { relativeDayRu } from "./relativeDay";
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
  /** Sort key: ISO start of the visit, `null` when the source never recorded one. */
  startedAt: string | null;
}

/** One discipline item in the sheet's ledger strip. */
export interface SheetMark {
  key: string;
  label: string;
  /** The name inside the plate: the stored label is a whole sentence and will not fit. */
  short: string;
  count: number;
  target: number;
  done: boolean;
  /** Consecutive days this item held; the plate prints it as a numeral. */
  streak: number;
  /** A goalless item: it earns a plate only on the days it was reported. */
  optional: boolean;
}

/** The monster's three states (PRD §5.6); an unreported day is not a clean one. */
export type MonsterVerdict = "clean" | "drunk" | "unreported";

export interface SheetMonster {
  verdict: MonsterVerdict;
  streak: number;
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
 * The ledger strip: the day's discipline items as plates. The monster is left out — its plate
 * would read "not done" on a sober day, which is the opposite of the truth ([sheetMonster]).
 */
export function sheetLedger(day: DayView): SheetMark[] {
  return day.discipline.filter(shownInLedger).map(toMark);
}

/**
 * A goalless item (`target` 0) is OPTIONAL and earns a plate only on a day it was reported: an
 * empty plate beside filled ones reads as a miss. An item that already has FRAMES loses its plate
 * too — the cover above says the same thing louder. DESIGN §4.3
 */
function shownInLedger(item: DisciplineItemView): boolean {
  if (item.key === MONSTER_LENS_KEY) return false;
  if ((item.episodes?.length ?? 0) > 0 || (item.books?.length ?? 0) > 0) return false;
  return item.target > 0 || item.count > 0;
}

/**
 * Names inside the ledger plates. The stored labels are whole sentences and a plate is narrow;
 * the same shortening the trail map keeps for its stops (§4.1). An item the map does not know
 * keeps its own label — a new item gets a name, not a blank.
 */
const SHEET_SHORT: Readonly<Record<string, string>> = {
  stretch: "растяжка",
  reading: "чтение",
  podcasts: "подкасты",
  journal: "дневник",
  office: "офис",
  monster: "монстр",
};

/** The plate's name: the short form where there is one, the stored label otherwise. */
export function sheetShortLabel(key: string, label: string): string {
  return SHEET_SHORT[key] ?? label;
}

function toMark(item: DisciplineItemView): SheetMark {
  const optional = item.target <= 0;
  return {
    key: item.key,
    label: item.label,
    short: sheetShortLabel(item.key, item.label),
    count: item.count,
    target: item.target,
    done: optional ? item.count > 0 : item.count >= item.target,
    // The headline streak is the FIRST occurrence: "how many days running at all", not "running twice".
    streak: item.occurrenceStreaks?.[0] ?? 0,
    optional,
  };
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
    stamp: `${weekdayShortRu(iso)} ${iso.slice(8, 10)}.${iso.slice(5, 7)}`,
    relative: relativeDayRu(iso, today),
    title: day.title,
  };
}
