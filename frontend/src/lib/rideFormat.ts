/**
 * Форматтеры поездки Велобайк (PRD §9 B4) — дистанция и длительность для виджета и модалки.
 * Чистые функции, без локали-сюрпризов; покрываются юнит-тестом.
 */

/** Дистанция: <1 км — в метрах («650 м»), иначе километры с одним знаком («5.0 км»). */
export function formatKm(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} м`;
  return `${(meters / 1000).toFixed(1)} км`;
}

/** Длительность: «29 мин» или «4 ч 36 мин» (часы появляются от 60 мин). */
export function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} мин`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/** Стоимость: копейки → рубли, округление до целого («52 ₽»); 0/меньше — «бесплатно». */
export function formatCost(kopecks: number): string {
  if (kopecks <= 0) return "бесплатно";
  return `${Math.round(kopecks / 100)} ₽`;
}
