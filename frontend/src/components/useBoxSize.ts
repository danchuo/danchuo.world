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
  const watched = useRef<Element | null>(null);
  const observer = useRef<ResizeObserver | null>(null);

  /* ⚠️ Checked after EVERY commit, not once on mount: a tile shows its content only once loaded
     (`TileShell`), so on a slow answer the node is not there yet and a one-shot effect would
     measure nothing, ever. The identity guard makes every later pass a no-op. */
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === watched.current) return;
    observer.current?.disconnect();
    watched.current = el;
    if (!el || typeof ResizeObserver === "undefined") return; // jsdom has none; tests stay quiet
    observer.current = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: width, h: height });
    });
    observer.current.observe(el);
  });

  useLayoutEffect(() => () => observer.current?.disconnect(), []);

  return [ref, size];
}
