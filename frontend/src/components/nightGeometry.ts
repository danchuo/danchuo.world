import type { SleepBandView } from "@/lib/api/types";

/**
 * Геометрия ночи (§7.7, идея I-23): куски ночи переводятся в дорожки и доли оси.
 *
 * Считается чистой функцией и в долях, а не замером контейнера: мерить нечего — график тянется
 * по ширине плитки, — а jsdom всё равно не знает ResizeObserver, и замеряющий компонент в тестах
 * не рендерился бы вовсе.
 */

/** Фаза куска полосы; `awake` — не сон, но часть ночи. */
export type SleepStageKey = "light" | "deep" | "rem" | "awake";

export interface NightBandPart {
  stage: SleepStageKey;
  /** Номер дорожки сверху вниз — см. [LANES]. */
  lane: number;
  /** Доля оси в процентах. */
  left: number;
  width: number;
}

/**
 * Дорожки фаз сверху вниз — от бодрствования к самому глубокому сну.
 *
 * Вертикаль отдана глубине сна намеренно: фазы **упорядочены**, а порядок читается позицией и
 * не читается цветом — его можно только вспомнить. Пока все куски рисовались в полный рост,
 * вертикаль не несла ничего, и ночь выглядела штрих-кодом: видно, когда фазы менялись, и не
 * видно, какой была ночь. На дорожках сразу читается рельеф — глубокий сон в начале ночи,
 * REM к утру, пробуждения всплесками вверх. Подписи дорожек заодно работают вечной легендой.
 *
 * Подписи — как в приложении «Здоровье», а не как принято у остальных трекеров: фазу `light`
 * Apple называет Core («базовый»), и сверить дорожку читателю не с чем, кроме самого приложения.
 */
export const LANES: { stage: SleepStageKey; label: string }[] = [
  { stage: "awake", label: "не спал" },
  { stage: "rem", label: "REM" },
  { stage: "light", label: "базовый" },
  { stage: "deep", label: "глубокий" },
];

const LANE_OF: Record<SleepStageKey, number> = LANES.reduce(
  (acc, lane, i) => ({ ...acc, [lane.stage]: i }),
  {} as Record<SleepStageKey, number>,
);

export interface NightBandTick {
  minute: number;
  label: string;
  left: number;
}

export interface NightBandGeometry {
  /** Границы оси в минутах от начала суток-оси, прижатые к целым часам. */
  fromMinute: number;
  toMinute: number;
  parts: NightBandPart[];
  ticks: NightBandTick[];
}

/** Час MSK, с которого идёт ось — тот же, что отдаёт бэкенд в `axisStartHour`. */
const DEFAULT_AXIS_START_HOUR = 18;

/**
 * Цвет фазы — собственные токены сна (`--sleep-*`, объявлены в скине базовой волны). Общий на
 * ВСЕ вёрстки виджета: и бары долей, и полоса ночи, и промер глубины — одна фаза не может быть
 * двух цветов в одной плитке.
 *
 * Свои токены, а не общие цвета борда напрямую: по умолчанию они и раскрываются в общие
 * (акцент, край плитки, вторичный и третичный текст), но волна вправе дать сну собственный
 * спуск глубины — и меняет его тогда одним местом, а не четырьмя подстановками по коду.
 * Повод завести их реальный: на тёмном скине `--border-tile` почти прозрачен, и глубокий сон
 * пропадал с рисунка вовсе.
 */
export const STAGE_COLOR: Record<SleepStageKey, string> = {
  rem: "var(--sleep-rem)",
  deep: "var(--sleep-deep)",
  light: "var(--sleep-core)",
  awake: "var(--sleep-awake)",
};

/** Минута оси → время суток `ЧЧ:ММ`. */
export function clockLabel(minute: number, axisStartHour = DEFAULT_AXIS_START_HOUR): string {
  const clock = (axisStartHour * 60 + minute) % 1440;
  const h = Math.floor(clock / 60);
  const m = clock % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Шаг подписей: столько часов, чтобы делений было около пяти, а не частокол. */
function tickStep(spanMinutes: number): number {
  if (spanMinutes <= 360) return 60;
  if (spanMinutes <= 720) return 120;
  return 180;
}

export function nightBandGeometry(
  band: SleepBandView | null | undefined,
  axisStartHour = DEFAULT_AXIS_START_HOUR,
): NightBandGeometry | null {
  if (!band || band.parts.length === 0) return null;

  // Ось прижата к целым часам: подписи должны попадать на круглое время, а не на 23:17.
  const from = Math.floor(band.onsetMinute / 60) * 60;
  const to = Math.ceil(band.wakeMinute / 60) * 60;
  const span = to - from;
  const pct = (minute: number) => ((minute - from) / span) * 100;

  const ticks: NightBandTick[] = [];
  for (let m = from; m <= to; m += tickStep(span)) {
    ticks.push({ minute: m, label: clockLabel(m, axisStartHour), left: pct(m) });
  }

  return {
    fromMinute: from,
    toMinute: to,
    parts: band.parts.map((p) => ({
      stage: p.stage,
      lane: LANE_OF[p.stage],
      left: pct(p.fromMinute),
      width: pct(p.toMinute) - pct(p.fromMinute),
    })),
    ticks,
  };
}
