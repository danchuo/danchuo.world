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

/** Копейки → рубли строкой («52 ₽»), округление до целого. Неположительное — пусто. */
function rubles(kopecks: number): string {
  return `${Math.round(kopecks / 100)} ₽`;
}

/** Стоимость: копейки → рубли, округление до целого («52 ₽»); 0/меньше — «бесплатно». */
export function formatCost(kopecks: number): string {
  if (kopecks <= 0) return "бесплатно";
  return rubles(kopecks);
}

/**
 * Стоимость поездки для истории (модалка). Платная — «52 ₽». Бесплатная (`cost === 0`) едет в
 * рамках ранее купленного тарифа: если бэк нашёл покрывающую покупку — «в рамках тарифа за N ₽»
 * (её цена), иначе честное «бесплатно». `null` (нет данных о стоимости) ⇒ пустая строка.
 */
export function formatRideCost(
  costKopecks: number | null,
  coveredByTariffKopecks?: number | null,
): string {
  if (costKopecks == null) return "";
  if (costKopecks > 0) return rubles(costKopecks);
  if (coveredByTariffKopecks != null && coveredByTariffKopecks > 0) {
    return `в рамках тарифа за ${rubles(coveredByTariffKopecks)}`;
  }
  return "бесплатно";
}
