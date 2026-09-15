/**
 * Листание календаря колесом и тачпадом (PRD §5.3): чистая арифметика жеста без DOM.
 *
 * Задача — превратить поток `wheel`-событий в шаги «неделя назад / вперёд» так, чтобы сила
 * жеста читалась: лёгкое движение двумя пальцами даёт неделю, размашистое — несколько подряд,
 * а инерционный хвост тачпада докатывает окно, как докатывает любой список. Источники ведут
 * себя по-разному: колесо мыши шлёт редкие крупные щелчки (Chrome — 100px, Firefox — 3 строки),
 * тачпад — десятки мелких дельт по 2–20px. Отсюда две ветки ниже и числа при них.
 */

/**
 * Перемещение, за которое даётся одна неделя. Ощутимо больше щелчка мыши: это цена шага для
 * МЕЛКИХ дельт тачпада, и именно она делает жест управляемым — на коротком движении окно
 * стоит, на длинном едет.
 */
export const WHEEL_STEP_PX = 90;
/**
 * Дельта, которую считаем щелчком колеса (Chrome отдаёт 100px, Firefox 3 строки = 48px).
 * Щелчок — дискретное событие устройства: неделя за щелчок, без остатка. Копить его нечего,
 * у мыши промежуточных положений не бывает.
 */
export const WHEEL_NOTCH_PX = 40;
/**
 * Минимальный зазор между шагами. Столько живёт наплыв окна (DESIGN §5.2): чаще — и недели
 * сменяются быстрее, чем глаз успевает проводить ту, за которой следил.
 *
 * Зазор **откладывает** шаг, а не глотает его: накопленное переносится через паузу и уходит
 * следующим событием. Проглоченный шаг читался бы заеданием — жест был, а окно не поехало.
 */
export const WHEEL_MIN_STEP_GAP_MS = 160;
/** Простой, после которого накопленное обнуляется: ленивые касания с перерывом не складываются. */
export const WHEEL_IDLE_MS = 200;

export interface WheelState {
  /** Накопленное перемещение текущего жеста, px со знаком. */
  acc: number;
  /** Время последнего события, мс. */
  lastAt: number;
  /** Время последнего шага, мс. */
  steppedAt: number;
}

export function initialWheelState(): WheelState {
  return { acc: 0, lastAt: Number.NEGATIVE_INFINITY, steppedAt: Number.NEGATIVE_INFINITY };
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

/** Следующее состояние и шаг (−1 назад, +1 вперёд, 0 — ещё копим или ждём зазора). */
export function wheelStep(
  state: WheelState,
  travel: number,
  now: number,
): { state: WheelState; step: -1 | 0 | 1 } {
  if (travel === 0) return { state, step: 0 };

  const dir: -1 | 1 = travel > 0 ? 1 : -1;
  // Простой и разворот обнуляют копилку: складывать движение с тем, что было до паузы или
  // в другую сторону, значит листать от жеста, которого не было.
  const stale = now - state.lastAt > WHEEL_IDLE_MS;
  const carried = stale || Math.sign(state.acc) !== dir ? 0 : state.acc;
  const acc = Math.abs(travel) >= WHEEL_NOTCH_PX ? dir * WHEEL_STEP_PX : carried + travel;

  if (Math.abs(acc) < WHEEL_STEP_PX) {
    return { state: { ...state, acc, lastAt: now }, step: 0 };
  }
  if (now - state.steppedAt < WHEEL_MIN_STEP_GAP_MS) {
    // Отложенный шаг копится ровно один: иначе размашистый жест ставил бы окну очередь
    // из недель и оно продолжало бы ехать, когда пальцы уже сняты.
    return { state: { ...state, acc: dir * WHEEL_STEP_PX, lastAt: now }, step: 0 };
  }
  // Остаток переносится в следующий шаг — этим сильный жест и отличается от слабого.
  return { state: { acc: acc - dir * WHEEL_STEP_PX, lastAt: now, steppedAt: now }, step: dir };
}
