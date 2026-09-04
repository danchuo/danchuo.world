import { useEffect, useRef, type RefObject } from "react";
import { initialWheelState, wheelStep, wheelTravel } from "@/lib/wheelPaging";

interface WheelPagingGate {
  /** Есть куда листать назад (жест вверх / свайп вправо). */
  back: boolean;
  /** Есть куда листать вперёд (жест вниз / свайп влево). */
  forward: boolean;
}

/**
 * Листание колесом и тачпадом поверх элемента (PRD §5.3). Арифметика жеста — в
 * `lib/wheelPaging`; здесь только DOM-шов.
 *
 * Слушатель нативный и `passive: false`, а не `onWheel` React: React вешает `wheel` пассивно,
 * и `preventDefault` из него не работает — страница прокручивалась бы вместе с листанием.
 * Перехватывается ТОЛЬКО жест, которому есть куда листать: дома колесо вниз, у генезиса —
 * вверх уходят странице, как если бы плитки под курсором не было. Иначе на ноутбуке, где
 * борд чуть выше экрана, курсор над календарём запирал бы прокрутку.
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
