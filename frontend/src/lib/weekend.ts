/**
 * Выходной по дате-ключу MSK (§4/§5.6). Ось дня — `LocalDate` в MSK (строка `YYYY-MM-DD`),
 * поэтому день недели берём прямо из даты: парсим как UTC-полночь, чтобы локальная tz браузера
 * не сдвинула дату на соседний день. `getUTCDay()`: 0 = воскресенье, 6 = суббота.
 *
 * На выходных плитка «Сегодня» показывает сцену отдыха вместо карты-тропы, а стрик дисциплины
 * выходные перешагивает (см. бэкенд `StreakCalculator`); монстр считается всегда.
 */
export function isWeekend(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** Waves shipping a weekend rest-scene asset (/assets/waves/<wave>/today/weekend-horizon.png).
 *  Waves without one keep the discipline quest map on weekends (graceful fallback). */
const WEEKEND_SCENE_WAVES = new Set(["wave-01"]);

/** Does this wave have a weekend rest scene? Gate for swapping the quest map on Sat/Sun. */
export function hasWeekendScene(wave?: string | null): boolean {
  return wave != null && WEEKEND_SCENE_WAVES.has(wave);
}
