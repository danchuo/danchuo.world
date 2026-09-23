import { useCallback } from "react";

/**
 * A ref for a horizontal strip with no visible scrollbar: a vertical wheel moves it sideways, and at
 * an edge the wheel goes back to the page rather than being trapped. A trackpad's own horizontal
 * swipe is left to the browser. Mouse dragging is deliberately absent: it swallows clicks. DESIGN §7.5
 */
export function useSidewaysWheel<T extends HTMLElement>() {
  return useCallback((el: T | null) => {
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft >= max - 1;
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
}
