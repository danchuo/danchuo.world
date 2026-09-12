/**
 * Лента прожитых дней — холст волны 03 «PRIME» (DESIGN §10.2).
 *
 * Волна рисует фоном не орнамент, а сами данные борда: окно календаря, разложенное
 * в одну строку через точку и повторённое до края экрана. Здесь только чистое
 * превращение `DaySummary[]` → строка; повтор и отрисовка — за `WaveBackdrop`.
 *
 * Набор полей ограничен тем, что **уже едет** в окне календаря: минут подкастов и
 * чтения в [DaySummary] нет (они живут в `DayView`, по одному дню), и расширять его
 * ради фона не стали — бэк эта волна не трогает.
 *
 * Соглашение `null ≠ 0` то же, что в `format.ts`: не собранная метрика из ленты
 * выпадает целиком, а честный ноль остаётся (`git +0`) — фон не должен врать,
 * будто день был пустым, если его просто не опрашивали.
 */

import type { DaySummary } from "./api/types";
import { weekdayShortRu } from "./date";
import { formatSleepShort, formatSteps } from "./format";

/** Разделитель и внутри дня, и между днями: лента должна читаться как одна строка. */
const DOT = " · ";

/**
 * День в ленте: `пн 25.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · git +3`.
 *
 * ⚠️ Метка канала вкладов — **`git`, а не «вклады»**. Соседи в строке
 * названы предметом («сон», «шаги»), и «вклады» вставало в тот же ряд, ничего при этом не
 * называя: слово одинаково читается и про деньги, и про долю в чём-то. `git` предмет называет
 * прямо и на холсте волны, набранном моноширинным, выглядит своим.
 * `null` — дню нечего сказать (одна голая дата строкой не считается).
 *
 * Дроби дисциплины (`4/7`) в ленте НЕТ: на холсте они читались как второй голос данных и
 * мешали — фон обязан оставаться подложкой. Вместе с ними из `DaySummary` ушли и сами
 * свёртки `disciplineDone`/`disciplineTotal`: лента была их единственным потребителем,
 * а линза календаря считает по `disciplineCounts` (§5.3).
 */
export function ribbonDay(summary: DaySummary): string | null {
  const parts: string[] = [];

  if (summary.title) parts.push(summary.title);
  if (summary.sleepMinutes !== null) parts.push(`сон ${formatSleepShort(summary.sleepMinutes)}`);
  if (summary.steps !== null) parts.push(`шаги ${formatSteps(summary.steps)}`);
  if (summary.contributions !== null) parts.push(`git +${summary.contributions}`);

  if (parts.length === 0) return null;
  return [`${weekdayShortRu(summary.date)} ${dayMonth(summary.date)}`, ...parts].join(DOT);
}

/**
 * Окно календаря одной строкой. Пустые дни выпадают, двойных точек не остаётся.
 *
 * `today` (MSK, ISO) — опора: **дни после неё в ленту не попадают**. Без неё холст врал бы:
 * окно календаря заходит на неделю вперёд, а вклады за будущий день приезжают честным нулём —
 * и непрожитый день печатался бы наравне с прожитым («чт 27.08 · git +0»). Холст называется
 * лентой ПРОЖИТЫХ дней; сегодняшний в ней остаётся. Сравнение строковое: ISO-даты
 * сортируются лексикографически.
 */
export function buildRibbon(summaries: DaySummary[], today: string): string {
  return summaries
    .filter((s) => s.date <= today)
    .map(ribbonDay)
    .filter((line): line is string => line !== null)
    .join(DOT);
}

/** `2026-08-25` → `25.08`: в ленте год избыточен, окно календаря всегда рядом с сегодня. */
function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}
