import type { SleepStagesView } from "@/lib/api/types";

/**
 * Фазы сна для плитки «сон» (§7.7): REM / deep / light с долей от суммарного сна. `awake`
 * (пробуждения) в сумму не входит — так же, как Apple считает «Time Asleep» (PRD §7). Проценты
 * округляются от total = rem+deep+light. Нет фаз (часы не носили) ⇒ `null`, плитка деградирует
 * до одной длительности (§5.4).
 */
export interface SleepPhase {
  key: "rem" | "deep" | "light";
  label: string;
  minutes: number;
  pct: number;
}

export function sleepPhases(stages: SleepStagesView | null | undefined): SleepPhase[] | null {
  if (!stages) return null;
  const rem = stages.rem ?? 0;
  const deep = stages.deep ?? 0;
  const light = stages.light ?? 0;
  const total = rem + deep + light;
  if (total <= 0) return null;
  const pct = (v: number) => Math.round((v / total) * 100);
  return [
    { key: "rem", label: "REM", minutes: rem, pct: pct(rem) },
    { key: "deep", label: "DEEP", minutes: deep, pct: pct(deep) },
    { key: "light", label: "LIGHT", minutes: light, pct: pct(light) },
  ];
}
