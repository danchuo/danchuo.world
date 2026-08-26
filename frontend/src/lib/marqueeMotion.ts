/**
 * Механика бегущей ленты, которую можно листать рукой (DESIGN §7.2).
 *
 * Лента едет сама и одновременно слушается указателя: мышью и пальцем её тянут вперёд и назад,
 * после броска она докатывается и возвращается к собственному ходу. Здесь — только счёт: чистые
 * функции без DOM и без времени. Кадры, слушатели и стили — в `useMarqueeDrag`.
 */

/** Дальше этого порога (px) жест считается протяжкой, а не тапом по предмету. */
export const DRAG_SLOP = 6;

/** Опорный кадр (мс) для затухания: коэффициент ниже задан «за кадр 60fps». */
const FRAME_MS = 1000 / 60;

/** Сколько скорости броска остаётся за кадр. */
const FLING_DECAY = 0.94;

/** Тише этого (px/мс ≈ 24px/с) бросок гасим: иначе лента ещё секунды ползёт заметно медленнее
 *  собственного хода, и это читается как подтормаживание, а не как инерция. */
export const FLING_MIN = 0.04;

/** Сколько последних миллисекунд протяжки считаются броском. */
const FLING_WINDOW_MS = 90;

/** Потолок броска (px/мс = 3000px/с). Живой палец столько не выжимает; потолок стоит против
 *  ЧАСОВ: две точки, легшие в доли миллисекунды, дают честную производную в сотни px/мс, и
 *  лента улетала бы на десятки копий за кадр. */
export const FLING_MAX = 3;

export interface DragSample {
  /** Момент точки (мс). */
  t: number;
  /** Координата указателя вдоль ленты (px). */
  pos: number;
}

/**
 * Смещение ленты в пределах одной копии контента: `span` — размер копии, а копий в треке две,
 * поэтому шаг на целую копию незаметен (петля бесшовна, как у прежних CSS `-50%`).
 *
 * Остаток именно ПОЛОЖИТЕЛЬНЫЙ: назад лента листается так же бесконечно, как вперёд, — уехав
 * за ноль, она заходит с конца копии, а не упирается в край своего единственного круга.
 */
export function wrapOffset(offset: number, span: number): number {
  if (!Number.isFinite(span) || span <= 0 || !Number.isFinite(offset)) return 0;
  const wrapped = offset % span;
  return wrapped < 0 ? wrapped + span : wrapped;
}

/**
 * Скорость броска (px/мс) по последним точкам протяжки.
 *
 * Считается по хвосту в `FLING_WINDOW_MS`, а не по всей протяжке: «довёл и придержал» — это
 * указание точки, а не бросок, и лента обязана остаться там, где её оставили. Средняя по всему
 * жесту как раз выкидывала бы её дальше вопреки руке.
 */
export function flingVelocity(samples: readonly DragSample[]): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  // Шаг назад делается всегда, даже если предыдущая точка старше окна: две редкие точки —
  // это всё, что известно о жесте, и отказ считать по ним означал бы «броска не было».
  let first = samples[samples.length - 2];
  for (let i = samples.length - 3; i >= 0; i--) {
    if (last.t - samples[i].t > FLING_WINDOW_MS) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  const v = (last.pos - first.pos) / dt;
  return Math.max(-FLING_MAX, Math.min(FLING_MAX, v));
}

/**
 * Затухание броска за прошедшее время. Привязано к миллисекундам, а не к числу кадров: на
 * 120-герцовом экране кадров вдвое больше, и покадровый множитель гасил бы бросок вдвое быстрее.
 */
export function decayVelocity(v: number, dtMs: number): number {
  const decayed = v * FLING_DECAY ** (dtMs / FRAME_MS);
  return Math.abs(decayed) < FLING_MIN ? 0 : decayed;
}

/** Собственный ход ленты (px/мс) из времени полного прохода копии — прежний темп анимации. */
export function driftSpeed(span: number, seconds: number): number {
  if (!Number.isFinite(span) || !Number.isFinite(seconds) || span <= 0 || seconds <= 0) return 0;
  return span / (seconds * 1000);
}
