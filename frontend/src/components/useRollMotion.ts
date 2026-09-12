import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { centerScroll, rollMotionStep } from "@/lib/dropRoll";

/** Ось ленты: `x` — плёнка дропа, `y` — карусель архива. */
export type RollAxis = "x" | "y";

/** Как читать и писать прокрутку выбранной оси. Всё остальное у обеих лент общее. */
interface AxisOps {
  pos(el: HTMLElement): number;
  setPos(el: HTMLElement, value: number): void;
  goal(el: HTMLElement, cell: HTMLElement): number;
  cellSize(cell: HTMLElement): number;
}

const AXIS: Record<RollAxis, AxisOps> = {
  x: {
    pos: (el) => el.scrollLeft,
    setPos: (el, value) => {
      el.scrollLeft = value;
    },
    goal: (el, cell) => centerScroll(cell.offsetLeft, cell.offsetWidth, el.clientWidth, el.scrollWidth - el.clientWidth),
    cellSize: (cell) => cell.offsetWidth,
  },
  y: {
    pos: (el) => el.scrollTop,
    setPos: (el, value) => {
      el.scrollTop = value;
    },
    goal: (el, cell) => centerScroll(cell.offsetTop, cell.offsetHeight, el.clientHeight, el.scrollHeight - el.clientHeight),
    cellSize: (cell) => cell.offsetHeight,
  },
};

/** Чем лента отвечает на заказ «встань на эту ячейку». */
export interface RollMotion {
  /**
   * Поехать к ячейке. Движение уже идёт ⇒ просто переставляем цель, скорость не обнуляется.
   * [rate] — разовая тягучесть ЭТОГО заказа (по умолчанию — тягучесть самой ленты).
   */
  to(index: number, rate?: number): void;
  /** Встать на ячейку мгновенно: стартовая позиция и возврат руки — не переход. */
  jump(index: number): void;
  /** Остановить движение и вернуть ленте защёлкивание. */
  stop(): void;
  /** Ячейка, к которой лента едет прямо сейчас; `null` — стоит. */
  target(): number | null;
}

/**
 * Собственное движение ленты к ячейке — общий шов обеих лент дропов (DESIGN §7.5).
 *
 * Вместо нативного `scrollTo({behavior: "smooth"})`, который каждым новым вызовом **обрывает
 * текущую анимацию и начинает новую с нуля**: на серии щелчков колеса лента шла рывками
 * «стоп-ход-стоп», а быстрая прокрутка вязла совсем — очередной щелчок считал, откуда ехать,
 * по ЖИВОМУ положению ещё едущей ленты, то есть от кадра, который она давно проехала бы.
 * Здесь цель **движущаяся**: заказ лишь переставляет `target`, один цикл rAF каждый кадр
 * подтягивает позицию к ней ([rollMotionStep]), а откуда считать следующий шаг, звонящий
 * спрашивает у [RollMotion.target] — не у разметки.
 *
 * На время движения с ленты снят `scroll-snap-type`: Chrome защёлкивает КАЖДОЕ программное
 * присвоение прокрутки к ближайшей ячейке, и лента прыгала бы целыми кадрами (замер на
 * плёнке: скорость 0, 130, 0, 130 px за кадр).
 *
 * [rateBase] — тягучесть ленты (доля оставшегося пути за кадр отрисовки). Не задана ⇒ дефолт
 * плёнки из [rollMotionStep]: у карусели архива кадр крупный и едет вертикально, и та же доля
 * читалась там слишком резвой — она передаёт свою, `CAROUSEL_MOTION_RATE`.
 */
export function useRollMotion(
  ref: RefObject<HTMLElement | null>,
  axis: RollAxis,
  rateBase?: number,
): RollMotion {
  const ops = AXIS[axis];
  const motionRef = useRef<{ target: number; pos: number; raf: number; lastT: number; rate?: number } | null>(
    null,
  );

  const stop = useCallback(() => {
    const motion = motionRef.current;
    if (!motion) return;
    cancelAnimationFrame(motion.raf);
    motionRef.current = null;
    if (ref.current) ref.current.style.scrollSnapType = "";
  }, [ref]);

  const to = useCallback(
    (index: number, rate?: number) => {
      const el = ref.current;
      if (!el || !el.children[index]) return;
      if (motionRef.current) {
        // Движение уже идёт — просто переставляем цель. Тягучесть заказа при этом важнее
        // текущей: клик по кадру просит доехать БЫСТРО, даже если лента лениво ехала к соседу.
        motionRef.current.target = index;
        if (rate !== undefined) motionRef.current.rate = rate;
        return;
      }
      el.style.scrollSnapType = "none";
      const step = (t: number) => {
        const motion = motionRef.current;
        if (!motion) return;
        const cell = el.children[motion.target] as HTMLElement | undefined;
        if (!cell) {
          stop();
          return;
        }
        const goal = ops.goal(el, cell);
        motion.pos = rollMotionStep(
          motion.pos,
          goal,
          motion.lastT ? t - motion.lastT : 1000 / 60,
          ops.cellSize(cell),
          motion.rate ?? rateBase,
        );
        motion.lastT = t;
        ops.setPos(el, motion.pos);
        if (motion.pos === goal) {
          stop();
          return;
        }
        motion.raf = requestAnimationFrame(step);
      };
      motionRef.current = { target: index, pos: ops.pos(el), raf: requestAnimationFrame(step), lastT: 0, rate };
    },
    [ops, rateBase, ref, stop],
  );

  const jump = useCallback(
    (index: number) => {
      const el = ref.current;
      const cell = el?.children[index] as HTMLElement | undefined;
      if (!el || !cell) return;
      stop();
      ops.setPos(el, ops.goal(el, cell));
    },
    [ops, ref, stop],
  );

  const target = useCallback(() => motionRef.current?.target ?? null, []);

  // Размонтировались посреди движения — кадры отрисовки больше некому обслуживать.
  useEffect(() => stop, [stop]);

  // Ссылка на сам пульт — стабильная: звонящие держат его в зависимостях эффектов, и новый
  // объект на каждый рендер пересобирал бы им слушатели (а карусели — ещё и раскладку).
  return useMemo(() => ({ to, jump, stop, target }), [to, jump, stop, target]);
}
