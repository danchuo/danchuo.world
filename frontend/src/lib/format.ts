/**
 * Форматирование статов для отображения (DESIGN §4, PRD §5.4).
 *
 * Ключевое соглашение **null ≠ 0**: отсутствие метрики (`null`) рендерим как «нет данных»,
 * реальный `0` — как `0`. Поэтому везде явная проверка `=== null`, а не truthy-проверка
 * (иначе `0` схлопнулся бы в «нет данных»).
 */

export const NO_DATA = "нет данных";

/** Шаги: `8 421`; `0` → `0`; `null` → «нет данных». */
export function formatSteps(steps: number | null): string {
  if (steps === null) return NO_DATA;
  return steps.toLocaleString("ru-RU");
}

/** Сон: `7 ч 17 мин`; `0` → `0 мин`; `null` → «нет данных». */
export function formatSleep(minutes: number | null): string {
  if (minutes === null) return NO_DATA;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

/** Прогресс пункта дисциплины дробью `2/2` (DESIGN §4). */
export function formatFraction(count: number, target: number): string {
  return `${count}/${target}`;
}

/** Пункт закрыт (для подсветки `--success`, DESIGN §4). */
export function isDisciplineDone(count: number, target: number): boolean {
  return count >= target;
}

/**
 * «N назад» для индикатора свежести (PRD §8). Компактные единицы (мин/ч/дн) под mono-плитку;
 * меньше минуты — «только что». Невалидный ISO → пустая строка (тайл покажет пусто).
 */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}
