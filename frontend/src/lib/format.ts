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

/** Компактный сон под узкую колонку: `7ч 32м`; `0` → `0м`; `null` → «нет данных». */
export function formatSleepShort(minutes: number | null): string {
  if (minutes === null) return NO_DATA;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}м`;
  if (m === 0) return `${h}ч`;
  return `${h}ч ${m}м`;
}

/** Метка оси Y для шагов: `15K`, `7.5K`, `0` (тысячи; дробная часть — один знак). */
export function formatStepsAxis(steps: number): string {
  if (steps === 0) return "0";
  const k = steps / 1000;
  return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
}

/** Метка оси Y для сна: `10ч`, `5ч`, `0` (часы, округлённо). */
export function formatSleepAxis(minutes: number): string {
  if (minutes === 0) return "0";
  return `${Math.round(minutes / 60)}ч`;
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
