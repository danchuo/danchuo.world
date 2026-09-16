/**
 * Velobike ride formatters (PRD §9 B4) — distance and duration for the widget and the modal.
 * Pure functions with no locale surprises; covered by a unit test.
 */

/**
 * Distance: metres below a kilometre, otherwise kilometres to one decimal. A trailing zero is
 * dropped — "5.0 km" promises precision the number lacks. The tail is removed AFTER rounding, since
 * rounding itself can produce a whole number and a check on the original would miss that case.
 */
export function formatKm(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} м`;
  return `${(meters / 1000).toFixed(1).replace(/\.0$/, "")} км`;
}

/** Duration: minutes, or hours and minutes once an hour is reached. */
export function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} мин`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/** Kopecks → roubles as a string, rounded to whole. Non-positive gives an empty string. */
function rubles(kopecks: number): string {
  return `${Math.round(kopecks / 100)} ₽`;
}

/** Cost: kopecks → roubles, rounded to whole; zero or less reads as "free". */
export function formatCost(kopecks: number): string {
  if (kopecks <= 0) return "бесплатно";
  return rubles(kopecks);
}

/**
 * Russian noun inflection by the number [n], given as the one/few/many forms. Used in the month
 * summary in the modal.
 */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (d === 1) return forms[0];
  if (d >= 2 && d <= 4) return forms[1];
  return forms[2];
}

/** Kopecks → whole roubles as a number, with no currency sign — for the summary, where "₽" is a label. */
export function rublesWhole(kopecks: number): number {
  return Math.round(kopecks / 100);
}

/**
 * A station address for display. The Velobike app marks a bike left outside a named station with a
 * city placeholder, which becomes an honest "outside a station" here — the mirror of the backend's
 * own check. A real address passes through with its whitespace collapsed.
 */
export function formatStationAddress(address: string | null): string | null {
  if (address == null) return null;
  const clean = address.replace(/\s+/g, " ").trim();
  const isCityPlaceholder = clean !== "" && !/[\s,\d]/.test(clean);
  return isCityPlaceholder ? "вне станции" : clean;
}

/**
 * A ride's cost for the history. Velobike charges in TWO records and the line shows both, or it
 * lies: the "access" purchase that enters a tariff, and whatever ran up beyond it. A ride under a
 * previously bought package shows only the excess — the package is counted on its buyer. PRD §7
 */
export function formatRideCost(ride: {
  costKopecks: number | null;
  accessKopecks?: number | null;
  coveredByTariffKopecks?: number | null;
}): string {
  const access = ride.accessKopecks ?? 0;
  const cost = ride.costKopecks ?? 0;
  if (ride.costKopecks == null && access <= 0) return "";

  if (access > 0) {
    const a = rublesWhole(access);
    const c = rublesWhole(Math.max(cost, 0));
    if (c <= 0) return rubles(access);
    return `${a + c} ₽ (доступ ${a} + ${c} сверх)`;
  }

  const covered = ride.coveredByTariffKopecks ?? 0;
  if (cost > 0) return covered > 0 ? `${rubles(cost)} сверх тарифа` : rubles(cost);
  if (covered > 0) return `в рамках тарифа за ${rubles(covered)}`;
  return "бесплатно";
}
