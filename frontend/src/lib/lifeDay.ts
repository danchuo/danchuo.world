/**
 * The owner's day of life: a date to "which day since birth is this". It is the hint on the Today
 * tile's date — the date stays a date and its place in a life surfaces only on hover. The
 * arithmetic runs over ISO strings at UTC midnight, so leap years and DST shift nothing. §4
 */

/** The first day of life is the birthday, which is day №1 rather than zero. */
export const BIRTH_DATE = "2002-06-06";

/**
 * The life-day number for a date (`YYYY-MM-DD`), the birthday being 1. Before birth it is `null`:
 * such a day has no number and nothing to label it with.
 */
export function lifeDayNumber(iso: string): number | null {
  const ms = Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${BIRTH_DATE}T00:00:00Z`);
  const days = Math.round(ms / 86_400_000);
  return days < 0 ? null : days + 1;
}

/**
 * The life-day caption in Russian. A masculine ordinal after digits carries only its final
 * letter, so the suffix is one character rather than two.
 */
export function lifeDayLabel(iso: string): string | null {
  const n = lifeDayNumber(iso);
  return n == null ? null : `${n}-й день жизни`;
}
