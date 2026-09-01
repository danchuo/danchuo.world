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
  /** Что это за фаза — текст подсказки по наведению на подпись (§7.7). */
  hint: string;
}

/**
 * Подсказки к фазам. Три коротких фразы, каждая про своё: что тело или мозг делает в эту фазу
 * и когда её больше. Минуты и долю зритель уже видит рядом с подписью, поэтому текст отвечает
 * ровно на оставшийся вопрос — «а что это вообще такое».
 *
 * Длина — вопрос жанра, а не габарита: резать подсказку больше некому (она всплывает в
 * портале и меряется экраном), но подсказка на борде — это одна мысль, а не абзац.
 */
const HINTS: Record<SleepPhase["key"], string> = {
  rem: "фаза снов: мозг разбирает прожитый день. Под утро её больше",
  deep: "ремонт тела: мышцы и иммунитет. Её больше в начале ночи",
  light: "самая долгая фаза; из неё легче всего проснуться",
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
    { key: "light", label: "LIGHT", minutes: light, pct: pct(light), hint: HINTS.light },
  ];
}
