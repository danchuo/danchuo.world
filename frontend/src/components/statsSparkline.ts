/**
 * Чистая логика спарклайна статов (§7.4) — окно/скролл/масштаб, отделённое от SVG-рендера
 * ради юнит-тестов. Ось данных — хронологический ряд дней (старые→новые, «сегодня» последний).
 *
 * Модель скролла: показываем окно из `size` дней; `offset` — на сколько дней окно отъехало
 * в прошлое от правого края (offset 0 = самые свежие дни, «сегодня» справа). Колесо/тачпад
 * меняют offset — влево вылезают более старые дни. Масштаб оси Y берём по ВСЕЙ истории
 * (не по видимому окну), чтобы высота точек не «прыгала» при скролле.
 */

export interface SparkPoint {
  date: string;
  /** Значение метрики за день (шаги / минуты сна). `null` = нет данных (не ноль). */
  value: number | null;
}

/** Насколько далеко в прошлое можно отлистать: избыток истории над окном (0 — скроллить некуда). */
export function maxOffset(historyLen: number, size: number): number {
  return Math.max(0, historyLen - size);
}

/** Зажать offset в допустимый диапазон [0, maxOffset]. */
export function clampOffset(offset: number, historyLen: number, size: number): number {
  return Math.min(Math.max(0, offset), maxOffset(historyLen, size));
}

/**
 * Видимое окно из `size` дней, отъехавшее на `offset` дней в прошлое от правого края.
 * История короче окна — возвращаем её целиком. offset зажимается к краям истории.
 */
export function visibleWindow(history: SparkPoint[], size: number, offset: number): SparkPoint[] {
  if (history.length <= size) return history;
  const clamped = clampOffset(offset, history.length, size);
  const end = history.length - clamped;
  return history.slice(end - size, end);
}

/** Максимум значения по всей истории (стабильная ось Y); пропуски (null) игнорируются, минимум 1. */
export function niceMax(history: SparkPoint[]): number {
  let max = 1;
  for (const p of history) {
    if (p.value !== null && p.value > max) max = p.value;
  }
  return max;
}

/** Среднее по непустым значениям (округлённое); `null`, если данных нет. Для «сред N» по окну. */
export function average(points: SparkPoint[]): number | null {
  let sum = 0;
  let count = 0;
  for (const p of points) {
    if (p.value !== null) {
      sum += p.value;
      count += 1;
    }
  }
  return count === 0 ? null : Math.round(sum / count);
}

export interface AxisBounds {
  min: number;
  max: number;
}

/**
 * Границы оси Y по видимому окну (§7.4) — чтобы линия «жила», а не липла к краю. Автомасштаб
 * min→max данных с паддингом; но если размах меньше `minSpan`, ось раздвигается до `minSpan`
 * симметрично от середины — так стабильные дни дают спокойную волну, а не раздутый шум («относительно
 * показательно»). Низ не опускаем ниже 0 (шаги/минуты неотрицательны). Пусто ⇒ `[0, minSpan]`.
 */
export function axisBounds(points: SparkPoint[], minSpan: number, padFactor = 0.15): AxisBounds {
  const values: number[] = [];
  for (const p of points) {
    if (p.value !== null) values.push(p.value);
  }
  if (values.length === 0) return { min: 0, max: Math.max(minSpan, 1) };

  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const pad = (hi - lo) * padFactor;
  lo = Math.max(0, lo - pad);
  hi = hi + pad;
  if (hi <= lo) hi = lo + 1;
  return { min: lo, max: hi };
}
