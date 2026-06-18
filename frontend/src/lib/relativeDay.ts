/**
 * Относительное имя дня по-русски (DESIGN §4) — подпись плитки «Сегодня» меняется под
 * выбранную в календаре дату. Приоритет: точные слова → день недели по календарным
 * неделям (пн–вс) → «N дней назад / через N дней». Канон дат — MSK (см. [./date]).
 *
 * «Прошлый/следующий» означают именно соседнюю КАЛЕНДАРНУЮ неделю, а не «±7 дней»:
 * день этой же недели — просто «в понедельник»; день следующей недели — «в следующий
 * понедельник»; дальше соседней недели — числом.
 */

import { addDays, mskToday, weekdayMondayIndex } from "./date";

/** Формы дня недели (по индексу `getUTCDay`: 0=вс): эта неделя / прошлая / следующая. */
const WEEKDAY: { bare: string; past: string; future: string }[] = [
  { bare: "в воскресенье", past: "в прошлое воскресенье", future: "в следующее воскресенье" }, // 0 вс
  { bare: "в понедельник", past: "в прошлый понедельник", future: "в следующий понедельник" }, // 1 пн
  { bare: "во вторник", past: "в прошлый вторник", future: "в следующий вторник" }, // 2 вт
  { bare: "в среду", past: "в прошлую среду", future: "в следующую среду" }, // 3 ср
  { bare: "в четверг", past: "в прошлый четверг", future: "в следующий четверг" }, // 4 чт
  { bare: "в пятницу", past: "в прошлую пятницу", future: "в следующую пятницу" }, // 5 пт
  { bare: "в субботу", past: "в прошлую субботу", future: "в следующую субботу" }, // 6 сб
];

/** Разница в днях: `date - today` (UTC-полночь, без дрейфа зоны). */
function dayDiff(date: string, today: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Понедельник недели, в которую попадает дата (ISO). */
function mondayOf(iso: string): string {
  return addDays(iso, -weekdayMondayIndex(iso));
}

/** Разница в календарных неделях (пн–вс): 0 — та же неделя, −1 — прошлая, +1 — следующая. */
function weekDiff(date: string, today: string): number {
  return Math.round(dayDiff(mondayOf(date), mondayOf(today)) / 7);
}

/** Склонение «день/дня/дней» по числу. */
export function pluralDays(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "день";
  if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return "дня";
  return "дней";
}

/**
 * Относительное имя дня. Точные термины (±2) приоритетнее, затем — день недели по
 * календарным неделям (эта/прошлая/следующая), дальше — числом. [today] по умолчанию —
 * сегодня MSK.
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
