/** Pure formatting for the private analytics dashboard (PRD §5.11): no React, no fetching. */

/** The period switch. 365 is the widest honest window — raw rows are purged past 400 days. */
export const PERIODS = [
  { days: 7, label: "7 дней" },
  { days: 30, label: "30 дней" },
  { days: 90, label: "90 дней" },
  { days: 365, label: "год" },
] as const;

export type BreakdownKey = "source" | "device" | "utmSource" | "utmMedium" | "utmCampaign" | "wave" | "viewport";

/** What the absent bucket of each dimension is called; null is a reading, not a gap. */
const EMPTY_LABEL: Record<BreakdownKey, string> = {
  source: "прямые заходы",
  device: "неизвестно",
  utmSource: "без метки",
  utmMedium: "без метки",
  utmCampaign: "без метки",
  wave: "не собиралось",
  viewport: "не измерен",
};

/** Time on page as minutes:seconds; `null` stays a dash — zero would mean an instant bounce. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("ru-RU").replace(/ /g, " ");
}

export function breakdownLabel(dimension: BreakdownKey, key: string | null): string {
  return key ?? EMPTY_LABEL[dimension];
}

/** MSK dates `[from, to]` for the last [days], today included. */
export function periodWindow(days: number, today: string): { from: string; to: string } {
  const to = new Date(`${today}T00:00:00Z`);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: from.toISOString().slice(0, 10), to: today };
}
