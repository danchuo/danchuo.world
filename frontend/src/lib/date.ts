/**
 * Канон дат MSK (PRD §4, CLAUDE.md). Ось данных — `YYYY-MM-DD` в зоне Europe/Moscow,
 * независимо от tz посетителя. Арифметика — над ISO-строками в UTC-полночь, чтобы не
 * ловить дрейф летнего времени и локальной зоны браузера.
 */

const MSK_ZONE = "Europe/Moscow";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Intl-форматтеры строятся один раз на модуль (создание дорогое — не повторяем на каждый вызов).
const MSK_TODAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: MSK_ZONE });
const MSK_CLOCK_FMT = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MSK_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});
const MONTH_RU_FMT = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "UTC" });
const MONTH_SHORT_RU_FMT = new Intl.DateTimeFormat("ru-RU", { month: "short", timeZone: "UTC" });
const WEEKDAY_SHORT_RU_FMT = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });

/** Сегодня в каноне MSK (`YYYY-MM-DD`), независимо от зоны посетителя. */
export function mskToday(now: Date = new Date()): string {
  // en-CA форматирует как YYYY-MM-DD.
  return MSK_TODAY_FMT.format(now);
}

/**
 * Время суток по MSK (`09:12`) из ISO-момента, который отдаёт бэкенд. Зона зашита, как и у
 * дат: борд отвечает про день владельца, а не про часовой пояс смотрящего — «заход в 09:12»
 * из Владивостока обязан оставаться утренним заходом.
 */
export function mskClock(instant: string): string {
  return MSK_CLOCK_FMT.format(new Date(instant));
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

/** Понедельник недели, в которую попадает дата (недели считаем пн→вс). */
export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayMondayIndex(iso));
}

/**
 * Окно календаря целыми неделями вокруг [center]: [weeksBefore] прошлых недель + неделя
 * центра + [weeksAfter] будущих, всегда с понедельника по воскресенье (PRD §5.3).
 *
 * Границы режутся по неделям, а не по «±N дней», потому что календарь — сетка недель:
 * окно ±15 дней начиналось с произвольного дня недели, первый ряд выходил рваным
 * (полупустая неделя), и «прошлая неделя» на нём читалась наполовину.
 */
export function weekWindowAround(
  center: string,
  weeksBefore: number,
  weeksAfter: number,
): { from: string; to: string } {
  const monday = startOfWeek(center);
  return {
    from: addDays(monday, -7 * weeksBefore),
    // Конец — воскресенье последней недели: понедельник её начала плюс шесть дней.
    to: addDays(monday, 7 * weeksAfter + 6),
  };
}

/** Число месяца (1..31) для ячейки календаря. */
export function dayOfMonth(iso: string): number {
  assertIso(iso);
  return Number(iso.slice(8, 10));
}

/**
 * Месяц даты словом (`июнь`), с годом — только если он не совпадает с [today] (`декабрь 2025`).
 * Подпись отлистанного окна календаря (§5.3): по одним числам дней месяц не опознать, а год
 * добавлять всегда значит шуметь им все двенадцать месяцев из тринадцати.
 */
export function monthNameRu(iso: string, today: string): string {
  assertIso(iso);
  const name = MONTH_RU_FMT.format(new Date(`${iso}T00:00:00Z`));
  const year = iso.slice(0, 4);
  return year === today.slice(0, 4) ? name : `${name} ${year}`;
}

/** Короткий день недели в RU (`пн`..`вс`) — подпись выходного на оси графиков активности (§7.4). */
export function weekdayShortRu(iso: string): string {
  assertIso(iso);
  return WEEKDAY_SHORT_RU_FMT.format(new Date(`${iso}T00:00:00Z`));
}

/** Индекс дня недели с началом в понедельник: 0=пн … 5=сб, 6=вс (для сетки календаря §5). */
export function weekdayMondayIndex(iso: string): number {
  assertIso(iso);
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * Месяц сокращённо (`июл`) — подпись на первом числе месяца в сетке календаря (§5.3).
 * Точку, которую ru-RU ставит у части месяцев (`июл.`), снимаем: в клетке рядом с числом
 * она читается как мусор, а не как сокращение.
 */
export function monthShortRu(iso: string): string {
  assertIso(iso);
  return MONTH_SHORT_RU_FMT.format(new Date(`${iso}T00:00:00Z`)).replace(".", "");
}

/** Месяц даты как `YYYY-MM` — для сравнения соседних дней в сетке (§5.3). */
export function monthOf(iso: string): string {
  assertIso(iso);
  return iso.slice(0, 7);
}

function assertIso(iso: string): void {
  if (!ISO_DATE.test(iso)) throw new Error(`Ожидалась дата YYYY-MM-DD, получено: ${iso}`);
}
