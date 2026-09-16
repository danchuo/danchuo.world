import type { SleepBandView, SleepStagesView } from "@/lib/api/types";
import { LANES, type SleepStageKey } from "./nightGeometry";

/**
 * Геометрия «эхолота» — редакции плитки сна, где ночь читается промером глубины (DESIGN §7.7).
 *
 * Несущая мысль: **оба режима показывают ОДНИ И ТЕ ЖЕ бруски**, и переключение — это
 * пересортировка, а не подмена картинки. Брусок — столб воды от поверхности до дна своей фазы;
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

/**
 * Сколько брусков в промере. Единица рисунка — брусок, а НЕ минута, и это несущее: ночь
 * в семь часов на этой плитке даёт минуту тоньше пикселя, а столб тоньше пикселя рисуется
 * не столбом, а муаром — краевое сглаживание соседей складывается в полосатую рябь, в которой
 * не читается ни масса фазы, ни сам жест пересортировки. Число подобрано под ширину плитки
 * (DESIGN §10.2): на ней брусок выходит около четырёх пикселей и остаётся бруском.
 */
const BRICKS = 64;

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

/**
 * Какую долю своего шага занимает брусок. Остаток — просвет, и он здесь НАМЕРЕННЫЙ: кладка
 * читается кладкой, а не сплошной заливкой, и одна и та же кладка стоит в обоих режимах,
 * поэтому пересортировка видна поштучно. Просвет обязан быть долей шага, а не числом единиц
 * viewBox: по горизонтали рисунок растягивается под плитку, и абсолютная щель разъехалась бы
 * вместе с ней.
 */
const BRICK_FILL = 0.82;

export interface EchoBrick {
  stage: SleepStageKey;
  /** Место бруска в ночи. */
  index: number;
  /** Место бруска ВНУТРИ своей фазы — им и задаётся сумма. */
  rank: number;
}

export interface EchoNight {
  bricks: EchoBrick[];
  /** Итоги ночи в МИНУТАХ, а не в брусках: подпись считается по данным, а не по рисунку. */
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

function tally(stages: SleepStageKey[], from = 0, to = stages.length): Record<SleepStageKey, number> {
  const out: Record<SleepStageKey, number> = { awake: 0, rem: 0, light: 0, deep: 0 };
  for (let i = from; i < to; i++) out[stages[i]] += 1;
  return out;
}

function build(stages: SleepStageKey[], timed: boolean): EchoNight | null {
  const totals = tally(stages);
  const asleep = totals.rem + totals.light + totals.deep;
  if (asleep <= 0) return null;
  const seen: Record<SleepStageKey, number> = { awake: 0, rem: 0, light: 0, deep: 0 };
  const bricks = lay(stages, totals).map((stage, index) => ({ stage, index, rank: seen[stage]++ }));
  return { bricks, totals, asleep, timed };
}

/**
 * Кладка ночи: минуты сводятся к [BRICKS] брускам.
 *
 * Сколько брусков какой фазе, решает КВОТА по наибольшим остаткам, а не то, кто победил
 * в окне: доля фазы в кладке тогда отличается от истинной меньше чем на брусок, а фаза,
 * которой в ночи набралось хотя бы на половину бруска, не пропадает с рисунка целиком.
 * Простое голосование по окну обе гарантии теряет: пробуждения короткие и разрозненные,
 * каждое проигрывает своему окну поодиночке — и подпись «не спал 23м» оказывалась бы над
 * пустым верхним горизонтом.
 *
 * Внутри окна из фаз с непотраченной квотой берётся самая частая: хронология точна везде,
 * где квота и окно согласны, и уезжает на брусок там, где нет.
 */
function lay(stages: SleepStageKey[], totals: Record<SleepStageKey, number>): SleepStageKey[] {
  const count = Math.min(stages.length, BRICKS);
  if (count === stages.length) return stages;

  const exact = LANES.map((lane) => (totals[lane.stage] * count) / stages.length);
  const left: Record<SleepStageKey, number> = { awake: 0, rem: 0, light: 0, deep: 0 };
  LANES.forEach((lane, i) => {
    left[lane.stage] = Math.floor(exact[i]);
  });
  const whole = LANES.reduce((sum, lane) => sum + left[lane.stage], 0);
  LANES.map((lane, i) => ({ stage: lane.stage, frac: exact[i] - Math.floor(exact[i]) }))
    .sort((a, b) => b.frac - a.frac)
    .slice(0, count - whole)
    .forEach((s) => {
      left[s.stage] += 1;
    });

  const out: SleepStageKey[] = [];
  for (let i = 0; i < count; i++) {
    const window = tally(
      stages,
      Math.floor((i * stages.length) / count),
      Math.floor(((i + 1) * stages.length) / count),
    );
    let pick = LANES[0].stage;
    let best = -1;
    for (const lane of LANES) {
      if (left[lane.stage] > 0 && window[lane.stage] > best) {
        pick = lane.stage;
        best = window[lane.stage];
      }
    }
    left[pick] -= 1;
    out.push(pick);
  }
  return out;
}

/** Столб одного бруска: прямоугольник хронологии плюс то, чем он становится в сумме. */
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
  const count = night.bricks.length;
  const pitch = ECHO_VIEW.width / count;
  const floorOf = (stage: SleepStageKey) => TOP + (DEPTH_OF[stage] + 1) * ROW_H;

  const columns = night.bricks.map(({ stage, index, rank }) => {
    const floor = floorOf(stage);
    const height = floor - TOP;
    return {
      stage,
      x: index * pitch,
      y: TOP,
      width: pitch * BRICK_FILL,
      height,
      shift: (rank - index) * pitch,
      squash: BAR_H / height,
    };
  });

  const floors = LANES.map((_, i) => TOP + (i + 1) * ROW_H);

  // Профиль — ступенчатая функция: внутри куска дно не меняется, поэтому точка ставится только
  // на границе фаз. Полсотни точек вместо полутысячи, рисунок тот же до пикселя.
  const points: string[] = [];
  night.bricks.forEach(({ stage, index }) => {
    const floor = floorOf(stage);
    const isEdge = index === 0 || night.bricks[index - 1].stage !== stage;
    if (isEdge) points.push(`${round(index * pitch)},${round(floor)}`);
    if (index === count - 1 || night.bricks[index + 1].stage !== stage) {
      points.push(`${round((index + 1) * pitch)},${round(floor)}`);
    }
  });

  return { columns, floors, profile: points.join(" ") };
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
