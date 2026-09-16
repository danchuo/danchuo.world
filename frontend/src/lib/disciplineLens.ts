import type { DaySummary } from "@/lib/api/types";
import { monsterVerdict } from "@/lib/monster";

/** Calendar lenses use key + occurrence so repeated discipline stops retain distinct thresholds. PRD §5.3, §5.6. */

/** Monster uses inverted matching polarity; see lensMatch. */
export const MONSTER_LENS_KEY = "monster";

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
  return `${lens.label}: ${match === "yes" ? "сделано" : "не сделано"}`;
}

/** Cell marking tone; monster marks only drinking, while clean days stay undimmed. DESIGN §5.1. */
export type LensTone = "match" | "drunk";

export function lensTone(match: LensMatch, lens: DisciplineLens): LensTone | null {
  // Unknown days receive no marking, including monster.
  if (match === "unknown") return null;
  if (lens.key === MONSTER_LENS_KEY) return match === "no" ? "drunk" : null;
  return match === "yes" ? "match" : null;
}
