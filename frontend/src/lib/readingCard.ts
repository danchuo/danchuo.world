import { mskClock } from "./date";
import type { ReadingBookView } from "./api/types";

/**
 * Формулы карточки прочитанного (PRD §5.16) — то, что нужно знать до отрисовки: какую сессию
 * показать у остановки, что написать про время и как выразить пройденный кусок книги.
 */

/**
 * Карточка для остановки с номером [occurrence] (1-based). Раздаются по порядку, и их может быть
 * МЕНЬШЕ, чем закрытых остановок: отметки считаются по сумме минут за сутки, а карточки — по
 * сессиям. Час в присест закрывает обе остановки и приносит одну карточку — вторая остаётся без
 * ховера, и это норма, а не потеря данных (то же правило, что у подкастов).
 */
export function bookForStop(
  books: ReadingBookView[] | undefined,
  occurrence: number,
): ReadingBookView | null {
  return books?.[occurrence - 1] ?? null;
}

/**
 * Путь по книге за этот заход: «35% → 42%».
 *
 * Начало известно не всегда, и пустота у него осмысленная: книга приехала к нам уже начатой, и
 * подставить туда ноль значило бы приписать владельцу проценты, которых он при нас не проходил.
 * Тогда показываем только достигнутое — «42%», без стрелки из ниоткуда.
 *
 * Конца не бывает только у импортированного дня (минуты есть, процентов нет) — там строки нет
 * вовсе: «→ 42%» без второго конца не отвечает ни на один вопрос.
 */
export function progressLabel(book: ReadingBookView): string | null {
  const end = percent(book.endPercent);
  if (end === null) return null;
  const start = percent(book.startPercent);
  if (start === null || start === end) return end;
  return `${start} → ${end}`;
}

/**
 * Строка времени в подвале карточки: «19:04 · 32 мин».
 *
 * У импортированного дня часов нет — мы тогда не смотрели, и время начала взять неоткуда;
 * остаются одни минуты. Выдумывать им время значило бы врать точнее, чем мы знаем.
 */
export function readingTimeLine(book: ReadingBookView): string {
  const minutes = `${book.readMinutes} мин`;
  return book.startedAt ? `${mskClock(book.startedAt)} · ${minutes}` : minutes;
}

/** Доля 0..1 в целые проценты; `null` — не знаем (это не то же самое, что 0%). */
function percent(value: number | null | undefined): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  // Читалка хранит долю, но 0.999 у дочитанной книги должно читаться как 100%, а не как 99.9%.
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}
