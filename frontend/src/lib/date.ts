/** MSK ISO dates define the data axis; UTC-midnight arithmetic avoids browser-zone and DST drift. PRD §4. */

const MSK_ZONE = "Europe/Moscow";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Reuse Intl formatters; constructing one per call is expensive.
const MSK_TODAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: MSK_ZONE });
const MSK_CLOCK_FMT = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MSK_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});
const MONTH_RU_FMT = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "UTC" });
const MONTH_SHORT_RU_FMT = new Intl.DateTimeFormat("ru-RU", { month: "short", timeZone: "UTC" });
const WEEKDAY_SHORT_RU_FMT = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });
const WEEKDAY_LONG_RU_FMT = new Intl.DateTimeFormat("ru-RU", { weekday: "long", timeZone: "UTC" });

/** Today's ISO date in MSK, independently of the visitor's zone. */
export function mskToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return MSK_TODAY_FMT.format(now);
}

/** Format a backend instant as MSK time so an owner's morning session stays morning for every visitor. */
export function mskClock(instant: string): string {
  return MSK_CLOCK_FMT.format(new Date(instant));
}

/** Shift an ISO date by a signed number of days. */
export function addDays(iso: string, days: number): string {
  assertIso(iso);
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive, continuous ISO date range [from, to]. */
export function datesInRange(from: string, to: string): string[] {
  assertIso(from);
  assertIso(to);
  const out: string[] = [];
  for (let cur = from; cur <= to; cur = addDays(cur, 1)) out.push(cur);
  return out;
}

/** Monday of the date's week. */
export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayMondayIndex(iso));
}

/** Whole-week calendar window around center, from Monday through Sunday. PRD §5.3. */
export function weekWindowAround(
  center: string,
  weeksBefore: number,
  weeksAfter: number,
): { from: string; to: string } {
  const monday = startOfWeek(center);
  return {
    from: addDays(monday, -7 * weeksBefore),
    // The final week's Sunday is six days after its Monday.
    to: addDays(monday, 7 * weeksAfter + 6),
  };
}

/** Day of month, 1..31. */
export function dayOfMonth(iso: string): number {
  assertIso(iso);
  return Number(iso.slice(8, 10));
}

/** Russian month name, including the year only when it differs from today. PRD §5.3. */
export function monthNameRu(iso: string, today: string): string {
  assertIso(iso);
  const name = MONTH_RU_FMT.format(new Date(`${iso}T00:00:00Z`));
  const year = iso.slice(0, 4);
  return year === today.slice(0, 4) ? name : `${name} ${year}`;
}

/** Short Russian weekday label for activity chart axes. DESIGN §7.4. */
export function weekdayShortRu(iso: string): string {
  assertIso(iso);
  return WEEKDAY_SHORT_RU_FMT.format(new Date(`${iso}T00:00:00Z`));
}

/** Full Russian weekday name, for the places wide enough to spell it out. DESIGN §4.3. */
export function weekdayLongRu(iso: string): string {
  assertIso(iso);
  return WEEKDAY_LONG_RU_FMT.format(new Date(`${iso}T00:00:00Z`));
}

/** Monday-based weekday index: Monday=0, Sunday=6. DESIGN §5. */
export function weekdayMondayIndex(iso: string): number {
  assertIso(iso);
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Russian short month name without its trailing abbreviation period. PRD §5.3. */
export function monthShortRu(iso: string): string {
  assertIso(iso);
  return MONTH_SHORT_RU_FMT.format(new Date(`${iso}T00:00:00Z`)).replace(".", "");
}

/** ISO month (YYYY-MM) for adjacent-day comparison. PRD §5.3. */
export function monthOf(iso: string): string {
  assertIso(iso);
  return iso.slice(0, 7);
}

function assertIso(iso: string): void {
  if (!ISO_DATE.test(iso)) throw new Error(`Ожидалась дата YYYY-MM-DD, получено: ${iso}`);
}
