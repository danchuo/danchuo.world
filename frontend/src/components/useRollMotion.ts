import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { centerScroll, rollMotionStep } from "@/lib/dropRoll";

/** The rail's axis: `x` is a drop's reel, `y` the archive carousel. */
export type RollAxis = "x" | "y";

/** How to read and write the chosen axis's scroll. Everything else is shared by both rails. */
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

/** How a rail answers the request "stand on this cell". */
export interface RollMotion {
  /**
   * Travel to a cell. If movement is already running the target is simply moved, without zeroing the
   * speed. [rate] is the stickiness of THIS request alone (the rail's own by default).
   */
  to(index: number, rate?: number): void;
  /** Stand on a cell instantly: a starting position and a hand's return are not transitions. */
  jump(index: number): void;
  /** Stop the movement and give the rail its snapping back. */
  stop(): void;
  /** The cell the rail is travelling to right now; `null` means it is still. */
  target(): number | null;
}

/**
 * The ribbon's own motion towards a cell, shared by both drop ribbons. Native smooth scrolling
 * ABORTS its animation on every new call, so a burst of wheel clicks moved in lurches. Here the
 * TARGET moves instead, and callers ask this seam where they are, not the markup. DESIGN §7.5
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
        // Movement is already running, so the target is simply moved. The request's stickiness outranks
        // the current one: a click on a frame asks to arrive FAST, even mid-lazy travel to a neighbour.
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

  // Unmounted mid-movement: there is no longer anyone to serve the painted frames.
  useEffect(() => stop, [stop]);

  // The handle itself is a stable reference: callers keep it in effect dependencies, and a new object
  // per render would rebuild their listeners — and, for the carousels, their layout too.
  return useMemo(() => ({ to, jump, stop, target }), [to, jump, stop, target]);
}
