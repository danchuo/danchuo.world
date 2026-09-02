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
 * выпадает целиком, а честный ноль остаётся (`вклады +0`) — фон не должен врать,
 * будто день был пустым, если его просто не опрашивали.
 */

import type { DaySummary } from "./api/types";
import { weekdayShortRu } from "./date";
import { formatFraction, formatSleepShort, formatSteps } from "./format";

/** Разделитель и внутри дня, и между днями: лента должна читаться как одна строка. */
const DOT = " · ";

/**
 * День в ленте: `пн 25.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · вклады +3 · 4/7`.
 * `null` — дню нечего сказать (одна голая дата строкой не считается).
 */
export function ribbonDay(summary: DaySummary): string | null {
  const parts: string[] = [];

  if (summary.title) parts.push(summary.title);
  if (summary.sleepMinutes !== null) parts.push(`сон ${formatSleepShort(summary.sleepMinutes)}`);
  if (summary.steps !== null) parts.push(`шаги ${formatSteps(summary.steps)}`);
  if (summary.contributions !== null) parts.push(`вклады +${summary.contributions}`);
  // Дисциплина без активных пунктов — это «пунктов нет», а не «ни одного не сделал»:
  // 0/0 в ленте читалось бы как провал дня.
  if (summary.disciplineTotal > 0) {
    parts.push(formatFraction(summary.disciplineDone, summary.disciplineTotal));
  }

  if (parts.length === 0) return null;
  return [`${weekdayShortRu(summary.date)} ${dayMonth(summary.date)}`, ...parts].join(DOT);
}

/** Окно календаря одной строкой. Пустые дни выпадают, двойных точек не остаётся. */
export function buildRibbon(summaries: DaySummary[]): string {
  return summaries
    .map(ribbonDay)
    .filter((line): line is string => line !== null)
    .join(DOT);
}

/** `2026-08-25` → `25.08`: в ленте год избыточен, окно календаря всегда рядом с сегодня. */
function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}
