import { useEffect, useRef, type RefObject } from "react";
import { initialWheelState, wheelStep, wheelTravel } from "@/lib/wheelPaging";

interface WheelPagingGate {
  /** There is somewhere to page back to (a gesture up, or a swipe right). */
  back: boolean;
  /** There is somewhere to page forward to (a gesture down, or a swipe left). */
  forward: boolean;
}

/**
 * Wheel and trackpad paging over an element; the gesture arithmetic lives in `lib/wheelPaging`.
 * The listener is native and `passive: false`, since React registers `wheel` passively and
 * `preventDefault` would not work. ONLY a gesture with somewhere to go is intercepted. PRD §5.3
 */
export function useWheelPaging(
  ref: RefObject<HTMLElement | null>,
  onStep: ((step: -1 | 1) => void) | undefined,
  gate: WheelPagingGate,
) {
  const state = useRef(initialWheelState());
  // Latest callback/gate without re-subscribing on every render.
  const latest = useRef({ onStep, gate });
  latest.current = { onStep, gate };
  const enabled = Boolean(onStep);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const handler = (e: WheelEvent) => {
      const { onStep: step, gate: can } = latest.current;
      if (!step) return;
      const travel = wheelTravel(e.deltaX, e.deltaY, e.deltaMode);
      if (travel === 0) return;
      if (travel > 0 ? !can.forward : !can.back) return;
      e.preventDefault();
      const r = wheelStep(state.current, travel, Date.now());
      state.current = r.state;
      if (r.step !== 0) step(r.step);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [ref, enabled]);
}
