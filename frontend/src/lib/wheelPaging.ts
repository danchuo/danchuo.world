/**
 * Листание календаря колесом и тачпадом (PRD §5.3): чистая арифметика жеста без DOM.
 *
 * Задача — превратить поток `wheel`-событий в дискретные шаги «неделя назад / вперёд»,
 * причём так, чтобы один жест давал ровно один шаг, а непрерывное движение — ровный ход.
 * Источники ведут себя по-разному: колесо мыши шлёт редкие крупные щелчки (Chrome — 100px,
 * Firefox — 3 строки), тачпад — десятки мелких дельт по 2–20px и затем инерционный хвост,
 * который может тянуться дольше полусекунды. Отсюда числа ниже.
 */

/** Перемещение, за которое даётся один шаг. Ниже щелчка мыши: щелчок листает сразу. */
export const WHEEL_STEP_PX = 32;
/**
 * Дельта, которую считаем щелчком колеса (Chrome отдаёт 100px, Firefox 3 строки = 48px).
 * Щелчок — намеренный жест: он листает и внутри блокировки, лишь бы шаги не слипались.
 */
export const WHEEL_NOTCH_PX = 40;
/** Минимальный зазор между шагами: два щелчка ближе этого сливаются в один. */
export const WHEEL_MIN_STEP_GAP_MS = 80;
/**
 * Блокировка после шага — на неё продлевает себя только ЗАТУХАЮЩИЙ поток (инерция тачпада:
 * дельты убывают). Растущая дельта — это новый толчок, она копится; убывающая — хвост,
 * он глотается. Два разобранных и отклонённых варианта блокировки — DESIGN §5.
 */
export const WHEEL_LOCK_MS = 200;
/** Простой, после которого накопленное обнуляется: ленивые касания с перерывом не складываются. */
export const WHEEL_IDLE_MS = 200;

export interface WheelState {
  /** Накопленное перемещение текущего жеста, px со знаком. */
  acc: number;
  /** Время последнего события, мс. */
  lastAt: number;
  /** Модуль последней дельты — по нему отличаем затухающий хвост от нового толчка. */
  lastMag: number;
  /** Время последнего шага, мс. */
  steppedAt: number;
  /** До этого момента затухающий поток глотается (инерция после шага). */
  lockedUntil: number;
}

export function initialWheelState(): WheelState {
  return {
    acc: 0,
    lastAt: Number.NEGATIVE_INFINITY,
    lastMag: 0,
    steppedAt: Number.NEGATIVE_INFINITY,
    lockedUntil: Number.NEGATIVE_INFINITY,
  };
}

/* One "line" of a line-mode wheel (Firefox) and one "page" of a page-mode wheel, in px. */
const LINE_PX = 16;
const PAGE_PX = WHEEL_STEP_PX * 3;

/**
 * Перемещение события в пикселях по доминирующей оси. Знак — направление листания:
 * положительное (вниз / свайп влево) — вперёд, отрицательное — назад.
 */
export function wheelTravel(deltaX: number, deltaY: number, deltaMode: number): number {
  const raw = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  if (deltaMode === 1) return raw * LINE_PX;
  if (deltaMode === 2) return raw * PAGE_PX;
  return raw;
}

/** Следующее состояние и шаг (−1 назад, +1 вперёд, 0 — ещё копим или глотаем инерцию). */
export function wheelStep(
  state: WheelState,
  travel: number,
  now: number,
): { state: WheelState; step: -1 | 0 | 1 } {
  if (travel === 0) return { state, step: 0 };

  const mag = Math.abs(travel);
  const dir: -1 | 1 = travel > 0 ? 1 : -1;
  const stepped = (): { state: WheelState; step: -1 | 1 } => ({
    state: { acc: 0, lastAt: now, lastMag: mag, steppedAt: now, lockedUntil: now + WHEEL_LOCK_MS },
    step: dir,
  });

  if (now < state.lockedUntil) {
    // A notch is deliberate: it pages even inside the lock, as long as steps don't merge.
    if (mag >= WHEEL_NOTCH_PX && now - state.steppedAt >= WHEEL_MIN_STEP_GAP_MS) return stepped();
    // A decaying stream is the inertia tail — swallow it and keep the lock alive.
    if (mag <= state.lastMag) {
      return { state: { ...state, lastAt: now, lastMag: mag, lockedUntil: now + WHEEL_LOCK_MS }, step: 0 };
    }
    // A growing delta is a new push — fall through and accumulate it.
  }

  const stale = now - state.lastAt > WHEEL_IDLE_MS;
  const sameSign = Math.sign(state.acc) === dir;
  const acc = (stale || !sameSign ? 0 : state.acc) + travel;

  if (Math.abs(acc) < WHEEL_STEP_PX) {
    return { state: { ...state, acc, lastAt: now, lastMag: mag }, step: 0 };
  }
  return stepped();
}
