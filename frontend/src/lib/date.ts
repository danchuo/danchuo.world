/**
 * Канон дат MSK (PRD §4, CLAUDE.md). Ось данных — `YYYY-MM-DD` в зоне Europe/Moscow,
 * независимо от tz посетителя. Арифметика — над ISO-строками в UTC-полночь, чтобы не
 * ловить дрейф летнего времени и локальной зоны браузера.
 */

const MSK_ZONE = "Europe/Moscow";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Intl-форматтеры строятся один раз на модуль (создание дорогое — не повторяем на каждый вызов).
const MSK_TODAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: MSK_ZONE });
const WEEKDAY_SHORT_RU_FMT = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });

/** Сегодня в каноне MSK (`YYYY-MM-DD`), независимо от зоны посетителя. */
export function mskToday(now: Date = new Date()): string {
  // en-CA форматирует как YYYY-MM-DD.
  return MSK_TODAY_FMT.format(now);
}

/** Сдвиг даты на [days] дней (может быть отрицательным). */
export function addDays(iso: string, days: number): string {
  assertIso(iso);
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Непрерывный список дат `[from, to]` включительно. */
export function datesInRange(from: string, to: string): string[] {
  assertIso(from);
  assertIso(to);
  const out: string[] = [];
  for (let cur = from; cur <= to; cur = addDays(cur, 1)) out.push(cur);
  return out;
}

/** Окно ±[radius] дней вокруг [center] — диапазон календаря (PRD §5.3, ±15). */
export function windowAround(center: string, radius: number): { from: string; to: string } {
  return { from: addDays(center, -radius), to: addDays(center, radius) };
}

/** Число месяца (1..31) для ячейки календаря. */
export function dayOfMonth(iso: string): number {
  assertIso(iso);
  return Number(iso.slice(8, 10));
}

/** Короткий день недели в RU (`пн`..`вс`) — для недельной полосы на мобиле (§8). */
export function weekdayShortRu(iso: string): string {
  assertIso(iso);
  return WEEKDAY_SHORT_RU_FMT.format(new Date(`${iso}T00:00:00Z`));
}

/** Индекс дня недели с началом в понедельник: 0=пн … 5=сб, 6=вс (для сетки календаря §5). */
export function weekdayMondayIndex(iso: string): number {
  assertIso(iso);
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Месяц даты как `YYYY-MM` — для сравнения «этот месяц / соседний» (§5). */
export function monthOf(iso: string): string {
  assertIso(iso);
  return iso.slice(0, 7);
}

function assertIso(iso: string): void {
  if (!ISO_DATE.test(iso)) throw new Error(`Ожидалась дата YYYY-MM-DD, получено: ${iso}`);
}
