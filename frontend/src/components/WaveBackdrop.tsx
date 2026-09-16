"use client";

import { useEffect, useMemo, useRef } from "react";
import type { DaySummary } from "@/lib/api/types";
import { onFontsReady } from "@/lib/fontGate";
import { buildRibbon } from "@/lib/waveRibbon";

/**
 * The wave's backdrop layer — a SHARED SEAM, not part of any one wave. It exists as a component
 * because PRIME's backdrop is the ribbon of lived days, which comes from the API and CSS cannot
 * reach. The markup is always present and `common.css` keeps it off until a skin wants it. §10.2
 */

/**
 * Ceiling on text length, insuring against a lying measurement. 300,000 characters cover an 8K wall
 * with room to spare and cost half a megabyte.
 */
const MAX_CHARS = 300_000;

/** The same separator as inside the ribbon, so the seam between repeats is not noticeable. */
const DOT = " · ";

/**
 * The share of a line's width below which no word wrap is made: otherwise a long word at the end
 * would cut half a line away and the ragged edge would read as a hole. Breaking by character count
 * was considered and rejected — it did not remove the side gaps and broke words mid-way.
 */
const MIN_LINE_FILL = 0.72;

/**
 * Character width when the measurement did not happen (jsdom, a hidden tab). The ribbon is set in
 * monospace, and in monospace faces a character is about 0.6 of the type size.
 */
const MONO_ADVANCE = 0.6;
/** Line spacing when `line-height` did not compute (`normal` in jsdom). */
const FALLBACK_LEADING = 1.4;

/**
 * The ribbon's character advance, measured from a sample, which is the only honest way. The sample
 * is taken FROM THE RIBBON ITSELF, not a string of zeroes: the canvas sets `word-spacing`, so a
 * sample without spaces underpaid for it and the line overran its window.
 */
function measureAdvance(el: HTMLElement, fontSize: number, sample: string): number {
  const text = sample.length >= 200 ? sample.slice(0, 200) : sample.repeat(Math.ceil(200 / Math.max(1, sample.length))).slice(0, 200);
  const probe = document.createElement("span");
  probe.textContent = text;
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;pointer-events:none";
  el.appendChild(probe);
  const width = probe.getBoundingClientRect().width / text.length;
  probe.remove();
  return width > 0 ? width : fontSize * MONO_ADVANCE;
}

export function WaveBackdrop({
  summaries,
  today,
  wave,
}: {
  summaries: DaySummary[];
  /** The "today" anchor (MSK): days after it do not travel onto the canvas, being unlived. */
  today: string;
  wave: string | null;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const ribbon = useMemo(() => buildRibbon(summaries, today), [summaries, today]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fill = () => {
      // The wave never switched the background on, so neither measurements nor text nodes are spent.
      if (!ribbon || getComputedStyle(el).display === "none") {
        el.replaceChildren();
        return;
      }

      const cs = getComputedStyle(el);
      const fontSize = parseFloat(cs.fontSize) || 12.5;
      const lineH = parseFloat(cs.lineHeight) || fontSize * FALLBACK_LEADING;
      const innerW =
        el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const innerH =
        el.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);

      // There is no layout yet (SSR hydration, a hidden tab): the ribbon is laid as a single line and
      // waits for the observer — with an unknown width there is nothing to break lines by.
      if (innerW <= 0 || innerH <= 0) {
        el.textContent = ribbon;
        return;
      }

      // The ribbon breaks its own lines rather than letting the browser wrap, because this wave
      // justifies ALTERNATE lines — odd left, even right — and `text-align` applies to a whole
      // paragraph at once. A single line cannot be steered from there, so each must be its own node.
      const advance = measureAdvance(el, fontSize, ribbon);
      // A character of slack: space density varies by line, and the average from a sample can come out
      // slightly optimistic. Falling a character short is invisible; overshooting cuts the tail.
      const perLine = Math.max(8, Math.floor(innerW / advance) - 1);
      const rows = Math.min(
        Math.ceil(innerH / lineH) + 1,
        Math.floor(MAX_CHARS / (perLine + 1)),
      );

      // The ribbon is shorter than the wall, so it repeats to the needed length with the same separator.
      // Doubling rather than appending piece by piece: a wall can be hundreds of times taller than the
      // ribbon, and a linear step hit the ceiling before it covered one.
      const need = rows * (perLine + 1);
      let pool = ribbon;
      while (pool.length < need && pool.length < MAX_CHARS) pool += DOT + pool;

      const frag = document.createDocumentFragment();
      let at = 0;
      for (let r = 0; r < rows; r += 1) {
        if (at >= pool.length) at = 0; // the ribbon ran out — go round again
        let end = Math.min(pool.length, at + perLine);
        if (end < pool.length) {
          // Wrapping by word: words are not cut in the middle at a line break, which is what makes the
          // edge ragged — and the ragged edge is the picture here.
          const cut = pool.lastIndexOf(" ", end);
          if (cut > at + perLine * MIN_LINE_FILL) end = cut;
        }
        const line = document.createElement("span");
        line.className = "wave-backdrop-line";
        line.textContent = pool.slice(at, end).trim();
        frag.appendChild(line);
        at = end + 1;
      }
      el.replaceChildren(frag);
    };

    fill();

    // Rebuild when the font gate opens: the ribbon is mono, and before it loads the lines are
    // measured in a fallback, so a fill honest at first no longer reaches the edge. A resize
    // observer misses this — the box does not change, the text metrics inside it do.
    const offFonts = onFontsReady(fill);

    // Observe the layer itself, not the window: it spans the page, so one source catches resize,
    // zoom, orientation and a page grown by new data. Duplicates change scrollHeight but not the
    // border box, so the observer never wakes itself. `undefined` is jsdom without ResizeObserver.
    let frame = 0;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(fill);
          });
    observer?.observe(el);
    return () => {
      offFonts();
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
    // `wave` is in the dependencies: a wave swap changes the layer's `display`, and the ribbon has to
    // be rebuilt for the new height (or erased, if the new wave draws no background).
  }, [ribbon, wave]);

  return (
    <div className="wave-backdrop" aria-hidden="true">
      <p className="wave-backdrop-ribbon" ref={ref} />
    </div>
  );
}
