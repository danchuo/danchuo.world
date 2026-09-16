import type { SleepStagesView } from "@/lib/api/types";

/**
 * Sleep phases for the sleep tile, as shares of total sleep. Wakings are NOT in that total, the
 * same way Apple counts "Time Asleep". No phases at all — the watch was not worn — gives `null`,
 * and the tile degrades to a single duration. DESIGN §7.7, PRD §5.4
 */
export interface SleepPhase {
  /**
   * The key is what HealthKit and our ingest call the phase, the label is what the Health app calls
   * it. They diverge deliberately: renaming the key would mean touching ingest, DB and API for the
   * sake of a caption, and the caption matters more — it is all the reader can check against.
   */
  key: "rem" | "deep" | "light";
  label: string;
  minutes: number;
  pct: number;
  /** What this phase is — the hover hint's text on the label (§7.7). */
  hint: string;
}

/**
 * Phase hints: three short lines, each about what the body or brain does in that phase and when
 * there is more of it. Minutes and share are already on screen beside the label, so the text
 * answers only what is left — what this actually is. Lowercase throughout, as the board speaks.
 */
const HINTS: Record<SleepPhase["key"], string> = {
  rem: "фаза снов: мозг разбирает прожитый день. под утро её больше",
  deep: "ремонт тела: мышцы и иммунитет. её больше в начале ночи",
  light: "самая долгая фаза, из неё легче всего проснуться",
};

export function sleepPhases(stages: SleepStagesView | null | undefined): SleepPhase[] | null {
  if (!stages) return null;
  const rem = stages.rem ?? 0;
  const deep = stages.deep ?? 0;
  const light = stages.light ?? 0;
  const total = rem + deep + light;
  if (total <= 0) return null;
  const pct = (v: number) => Math.round((v / total) * 100);
  return [
    { key: "rem", label: "REM", minutes: rem, pct: pct(rem), hint: HINTS.rem },
    { key: "deep", label: "DEEP", minutes: deep, pct: pct(deep), hint: HINTS.deep },
    { key: "light", label: "CORE", minutes: light, pct: pct(light), hint: HINTS.light },
  ];
}
