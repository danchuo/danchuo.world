/**
 * A day's relative name in Russian, the caption of the Today tile as the calendar's selection
 * moves. Priority: exact words, then a weekday within CALENDAR weeks, then a count of days. "Last"
 * and "next" mean the adjacent calendar week, never plus or minus seven days. DESIGN §4
 */

import { mskToday, startOfWeek } from "./date";

/** Weekday forms (indexed by `getUTCDay`, 0 = Sunday): this week, last week, next week. */
const WEEKDAY: { bare: string; past: string; future: string }[] = [
  { bare: "в воскресенье", past: "в прошлое воскресенье", future: "в следующее воскресенье" }, // 0 Sun
  { bare: "в понедельник", past: "в прошлый понедельник", future: "в следующий понедельник" }, // 1 Mon
  { bare: "во вторник", past: "в прошлый вторник", future: "в следующий вторник" }, // 2 Tue
  { bare: "в среду", past: "в прошлую среду", future: "в следующую среду" }, // 3 Wed
  { bare: "в четверг", past: "в прошлый четверг", future: "в следующий четверг" }, // 4 Thu
  { bare: "в пятницу", past: "в прошлую пятницу", future: "в следующую пятницу" }, // 5 Fri
  { bare: "в субботу", past: "в прошлую субботу", future: "в следующую субботу" }, // 6 Sat
];

/** The difference in days: `date - today` (UTC midnight, with no zone drift). */
function dayDiff(date: string, today: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** The difference in calendar weeks (Mon–Sun): 0 the same week, −1 last, +1 next. */
function weekDiff(date: string, today: string): number {
  return Math.round(dayDiff(startOfWeek(date), startOfWeek(today)) / 7);
}

/** The Russian plural form of "day" for a count. */
export function pluralDays(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "день";
  if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return "дня";
  return "дней";
}

/**
 * A day's relative name. Exact terms (±2) win first, then the weekday by calendar week (this,
 * last, next), then a plain count of days. [today] defaults to today in MSK.
 */
export function relativeDayRu(date: string, today: string = mskToday()): string {
  const diff = dayDiff(date, today);

  switch (diff) {
    case 0:
      return "сегодня";
    case -1:
      return "вчера";
    case -2:
      return "позавчера";
    case 1:
      return "завтра";
    case 2:
      return "послезавтра";
  }

  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weeks = weekDiff(date, today);

  if (weeks === 0) return WEEKDAY[weekday].bare;
  if (weeks === -1) return WEEKDAY[weekday].past;
  if (weeks === 1) return WEEKDAY[weekday].future;

  const n = Math.abs(diff);
  return diff < 0 ? `${n} ${pluralDays(n)} назад` : `через ${n} ${pluralDays(n)}`;
}
