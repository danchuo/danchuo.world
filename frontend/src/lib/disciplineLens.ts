import type { DaySummary } from "@/lib/api/types";
import { monsterVerdict } from "@/lib/monster";
import { isWeekend } from "@/lib/weekend";

/** Calendar lenses use key + occurrence so repeated discipline stops retain distinct thresholds. PRD §5.3, §5.6. */

/** Monster uses inverted matching polarity; see lensMatch. */
export const MONSTER_LENS_KEY = "monster";

/** An activity's lens key is namespaced: `gym` is both an activity and a possible checklist item. */
const ACTIVITY_LENS_PREFIX = "activity:";

export function activityLens(activity: string, label: string): DisciplineLens {
  return { key: ACTIVITY_LENS_PREFIX + activity, occurrence: 1, label };
}

function lensActivity(lens: DisciplineLens): string | null {
  return lens.key.startsWith(ACTIVITY_LENS_PREFIX) ? lens.key.slice(ACTIVITY_LENS_PREFIX.length) : null;
}

export interface DisciplineLens {
  /** Checklist key; MONSTER_LENS_KEY identifies monster consumption. */
  key: string;
  /** Completion threshold (1..target); always 1 for monster. */
  occurrence: number;
  /** Stop label used by the calendar and cell descriptions. */
  label: string;
}

/** yes = matched, no = recorded but unmatched, unknown = no answer; missing data must never imply noncompletion. */
export type LensMatch = "yes" | "no" | "unknown";

/** Compare stop identity for toggling the same lens off. */
export function sameLens(a: DisciplineLens | null, b: DisciplineLens | null): boolean {
  if (a == null || b == null) return a === b;
  return a.key === b.key && a.occurrence === b.occurrence;
}

/**
 * Pinning a lens toggles it: naming the one already pinned lets it go. The rule belongs with the
 * PINNED lens, not with a tile — under a try-on (DESIGN §5.2) a tile compares against what it
 * SEES, and a click on the lens being tried on would unpin it instead of fixing it.
 */
export function pinLens(
  pinned: DisciplineLens | null,
  next: DisciplineLens | null,
): DisciplineLens | null {
  return sameLens(pinned, next) ? null : next;
}

/** Match a day against the lens; monster returns yes for a recorded clean day, while lensTone controls visible marking. */
export function lensMatch(day: DaySummary, lens: DisciplineLens): LensMatch {
  // Empty and future days provide no answer.
  if (!day.hasData) return "unknown";

  if (lens.key === MONSTER_LENS_KEY) {
    // Health ingest can create a day without a monster response; absent marking stays unknown. PRD §5.6.
    const drunk = day.monsterDrunk ?? null;
    if (drunk == null) return "unknown";
    // Inverted polarity: drinking is no, a recorded clean day is yes.
    return drunk ? "no" : "yes";
  }

  const activity = lensActivity(lens);
  if (activity != null) {
    // An older backend sends no list at all, which is not the same as an empty one.
    if (!day.activities) return "unknown";
    return day.activities.includes(activity) ? "yes" : "no";
  }

  // Old cached responses lack counts; unknown avoids falsely reporting an entire empty streak.
  if (!day.disciplineCounts) return "unknown";
  return (day.disciplineCounts[lens.key] ?? 0) >= lens.occurrence ? "yes" : "no";
}

/** Name the lens by its stop label, including monster. DESIGN §5.1. */
export function lensTitle(lens: DisciplineLens): string {
  return lens.label;
}

/** Cell hover/screen-reader description; null means no answer. */
export function lensNote(match: LensMatch, lens: DisciplineLens): string | null {
  if (match === "unknown") return null;
  // Use the shared monster verdict wording.
  if (lens.key === MONSTER_LENS_KEY) return monsterVerdict(match === "no").phrase;
  if (lensActivity(lens) != null) return `${lens.label}: ${match === "yes" ? "было" : "не было"}`;
  return `${lens.label}: ${match === "yes" ? "сделано" : "не сделано"}`;
}

/** Cell marking tone; monster marks only drinking, an activity its own days in green. DESIGN §5.1. */
export type LensTone = "match" | "drunk" | "activity";

export function lensTone(match: LensMatch, lens: DisciplineLens): LensTone | null {
  // Unknown days receive no marking, including monster.
  if (match === "unknown") return null;
  if (lens.key === MONSTER_LENS_KEY) return match === "no" ? "drunk" : null;
  if (match !== "yes") return null;
  return lensActivity(lens) != null ? "activity" : "match";
}

/** A run of one day is not a run: below this a streak is noise, wherever it would be shown. */
export const STREAK_SHOWN_FROM = 2;

/** A day's place in the live run: `on` is a counted day, `step` one the run was stepped over. */
export type LensRunMark = "on" | "step";

export interface LensRun {
  /** Which days the run owns, and at what strength each of them is lit. */
  marks: Map<string, LensRunMark>;
  /** Counted length, in the backend's own terms — a stepped-over day adds nothing. */
  length: number;
  /** The run reached the earliest day held, so the count is a floor and not the whole answer. */
  truncated: boolean;
}

/**
 * The LIVE run behind the lens: the unbroken series of done days ending at today (DESIGN §5.2).
 * Its rules are the backend's own (`StreakCalculator`, PRD §5.6) — a weekend is stepped over and
 * an unfilled today does not drop it — or light and numeral would answer one question differently.
 */
export function lensRun(days: DaySummary[], lens: DisciplineLens, today: string): LensRun {
  // Clean days are the overwhelming majority (§5.1), and lighting them would flood the grid with
  // the very tone the monster's lens exists to pick out of it.
  // An activity is a fact of the day, not a discipline: it has no run to keep.
  if (lens.key === MONSTER_LENS_KEY || lensActivity(lens) != null) {
    return { marks: new Map(), length: 0, truncated: false };
  }

  let i = days.length - 1;
  while (i >= 0 && days[i].date > today) i--;

  const marks = new Map<string, LensRunMark>();
  // Days the run stepped over light only once a counted day turns up BELOW them: a run that never
  // starts must not leave a lit weekend hanging behind it.
  let stepped: string[] = [];
  let length = 0;
  for (; i >= 0; i--) {
    const day = days[i];
    if (lensMatch(day, lens) === "yes") {
      for (const iso of stepped) marks.set(iso, "step");
      stepped = [];
      marks.set(day.date, "on");
      length++;
      continue;
    }
    // The two days a run survives: a weekend is neutral for a discipline item, and today has not
    // failed while it is still going on.
    if (isWeekend(day.date) || day.date === today) {
      stepped.push(day.date);
      continue;
    }
    break;
  }
  return { marks, length, truncated: length > 0 && i < 0 };
}
