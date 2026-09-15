import type { SleepBandView, SleepStagesView } from "@/lib/api/types";
import { LANES, type SleepStageKey } from "./nightGeometry";

/**
 * Геометрия «эхолота» — редакции плитки сна, где ночь читается промером глубины (DESIGN §7.7).
 *
 * Несущая мысль: **оба режима показывают ОДНИ И ТЕ ЖЕ минуты**, и переключение — это
 * пересортировка, а не подмена картинки. Минута — столб воды от поверхности до дна своей фазы;
 * «по часам» ставит столбы в порядке ночи, «сумма» собирает их по горизонтам, и площадь цвета
 * при этом сохраняется по построению. Сумма, посчитанная отдельно от ночи, могла бы с ней
 * разойтись — здесь разойтись нечему.
 *
 * Считается в координатах viewBox, а не в пикселях плитки: все фигуры — прямоугольники по осям,
 * поэтому SVG растягивается `preserveAspectRatio="none"` и мерить контейнер не нужно вовсе
 * (тот же довод, что у `nightGeometry`: в jsdom замеряющий компонент не рендерился бы).
 */

/** Глубина фазы = её дорожка в [LANES]: порядок фаз у виджета один на все редакции. */
const DEPTH_OF: Record<SleepStageKey, number> = LANES.reduce(
  (acc, lane, i) => ({ ...acc, [lane.stage]: i }),
  {} as Record<SleepStageKey, number>,
);

/** Сколько горизонтов у промера — по одному на фазу. */
const DEPTHS = LANES.length;

/** Система координат рисунка. Высота — не пропорция плитки, а просто удобный масштаб. */
export const ECHO_VIEW = { width: 1000, height: 600 } as const;

/**
 * Поверхность и дно в долях высоты. Дно заходит ПОД растушёвку полосы подписи, но не под сам
 * текст: ночь лежит под подписью, как кадр под подписью в плитке дропа (§7.5), — и при этом
 * самый глубокий горизонт остаётся читаемым. Опустить дно ниже — и глубокий сон пропадает
 * за строкой с цифрами, то есть ровно та фаза, ради которой промер и рисуется.
 */
const TOP = ECHO_VIEW.height * 0.05;
const BOTTOM = ECHO_VIEW.height * 0.73;
const ROW_H = (BOTTOM - TOP) / DEPTHS;

/** Рост бруска в сумме — доля горизонта. Тоньше половины брусок читался линейкой, а не массой. */
const BAR_H = ROW_H * 0.62;

export interface EchoMinute {
  stage: SleepStageKey;
  /** Место минуты в ночи. */
  index: number;
  /** Место минуты ВНУТРИ своей фазы — им и задаётся сумма. */
  rank: number;
}

export interface EchoNight {
  minutes: EchoMinute[];
  totals: Record<SleepStageKey, number>;
  /** Сон без пробуждений — то же число, что `sleepMinutes` дня (§7.7). */
  asleep: number;
  /**
   * Есть ли у ночи хронология. Ночь без сохранённых кусков (часы отдали только итоги) знает
   * лишь свою сумму — переключать в ней нечего, и редакция остаётся в одном режиме.
   */
  timed: boolean;
}

/** Ночь по минутам из сохранённых кусков. Кусков нет ⇒ `null`. */
export function echoNight(band: SleepBandView | null | undefined): EchoNight | null {
  if (!band || band.parts.length === 0) return null;
  const stages: SleepStageKey[] = [];
  for (const part of band.parts) {
    for (let m = part.fromMinute; m < part.toMinute; m++) stages.push(part.stage);
  }
  return build(stages, true);
}

/**
 * Ночь из одних итогов: минуты фазы идут подряд. Хронологии тут нет и не будет — порядок
 * выбран не «примерный», а служебный: он нужен только чтобы собрать бруски суммы.
 */
export function echoNightFromStages(stages: SleepStagesView | null | undefined): EchoNight | null {
  if (!stages) return null;
  const order: SleepStageKey[] = [];
  for (const lane of LANES) {
    const minutes = minutesOf(stages, lane.stage);
    for (let m = 0; m < minutes; m++) order.push(lane.stage);
  }
  return build(order, false);
}

function minutesOf(stages: SleepStagesView, stage: SleepStageKey): number {
  return Math.max(0, Math.round(stages[stage] ?? 0));
}

function build(stages: SleepStageKey[], timed: boolean): EchoNight | null {
  const totals: Record<SleepStageKey, number> = { awake: 0, rem: 0, light: 0, deep: 0 };
  const seen: Record<SleepStageKey, number> = { awake: 0, rem: 0, light: 0, deep: 0 };
  const minutes: EchoMinute[] = stages.map((stage, index) => {
    totals[stage] += 1;
    return { stage, index, rank: seen[stage]++ };
  });
  const asleep = totals.rem + totals.light + totals.deep;
  if (asleep <= 0) return null;
  return { minutes, totals, asleep, timed };
}

/** Столб одной минуты: прямоугольник хронологии плюс то, чем он становится в сумме. */
export interface EchoColumn {
  stage: SleepStageKey;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Сдвиг вправо, ставящий столб на его место в сумме. */
  shift: number;
  /** Сжатие по вертикали ко дну своего горизонта — столб становится бруском. */
  squash: number;
}

export interface EchoGeometry {
  columns: EchoColumn[];
  /** Горизонты глубин — гравировка, без неё пустой уровень теряется. */
  floors: number[];
  /** Профиль дна ночи (`points` для polyline). Ступенька, поэтому точек столько же, сколько кусков. */
  profile: string;
}

export function echoGeometry(night: EchoNight): EchoGeometry {
  const count = night.minutes.length;
  const pitch = ECHO_VIEW.width / count;
  const floorOf = (stage: SleepStageKey) => TOP + (DEPTH_OF[stage] + 1) * ROW_H;

  const columns = night.minutes.map(({ stage, index, rank }) => {
    const floor = floorOf(stage);
    const height = floor - TOP;
    return {
      stage,
      x: index * pitch,
      y: TOP,
      // Перекрытие в полпикселя viewBox: соседние столбы одной фазы обязаны читаться сплошной
      // заливкой, а не частоколом с щелями сглаживания.
      width: pitch + ECHO_VIEW.width / 2000,
      height,
      shift: (rank - index) * pitch,
      squash: BAR_H / height,
    };
  });

  const floors = LANES.map((_, i) => TOP + (i + 1) * ROW_H);

  // Профиль — ступенчатая функция: внутри куска дно не меняется, поэтому точка ставится только
  // на границе фаз. Полсотни точек вместо полутысячи, рисунок тот же до пикселя.
  const points: string[] = [];
  night.minutes.forEach(({ stage, index }) => {
    const floor = floorOf(stage);
    const isEdge = index === 0 || night.minutes[index - 1].stage !== stage;
    if (isEdge) points.push(`${round(index * pitch)},${round(floor)}`);
    if (index === count - 1 || night.minutes[index + 1].stage !== stage) {
      points.push(`${round((index + 1) * pitch)},${round(floor)}`);
    }
  });

  return { columns, floors, profile: points.join(" ") };
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
