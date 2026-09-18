"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * The measured box of an element, in CSS pixels. A chart is drawn in REAL pixels rather than a
 * stretched viewBox: `preserveAspectRatio: none` would squash its type and its dots along with
 * the plot, and the tile's proportion is the wave's to change. DESIGN §7.4
 */
export function useBoxSize(): [RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") return; // jsdom has none; tests need the quiet path
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}
