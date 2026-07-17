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
 * Русское склонение существительного по числу [n]: `[одна, две, пять]`-форма.
 * «1 поездка», «2/3/4 поездки», «5..20 поездок». Используется в сводке месяца (модалка).
 */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (d === 1) return forms[0];
  if (d >= 2 && d <= 4) return forms[1];
  return forms[2];
}

/** Копейки → целые рубли числом (без знака валюты) — для сводки, где «₽» стоит подписью. */
export function rublesWhole(kopecks: number): number {
  return Math.round(kopecks / 100);
}

/**
 * Адрес станции для витрины. PWA Велобайка помечает велосипед, оставленный вне именованной
 * станции, заглушкой «просто город» («Москва») — показываем честное «вне станции» (признак:
 * одно слово без цифр и запятых, зеркало бэкового `StationGeocoder.isCityPlaceholder`).
 * Настоящий адрес проходит как есть, но с схлопнутыми пробелами (сырьё бывает с двойными).
 */
export function formatStationAddress(address: string | null): string | null {
  if (address == null) return null;
  const clean = address.replace(/\s+/g, " ").trim();
  const isCityPlaceholder = clean !== "" && !/[\s,\d]/.test(clean);
  return isCityPlaceholder ? "вне станции" : clean;
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
