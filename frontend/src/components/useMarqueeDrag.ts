"use client";

import { useCallback, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import {
  DRAG_SLOP,
  decayVelocity,
  driftSpeed,
  flingVelocity,
  wheelDelta,
  wrapOffset,
  type DragSample,
} from "@/lib/marqueeMotion";

interface MarqueeDragOptions {
  /** The rail's track — what travels inside the tile's window. */
  trackRef: RefObject<HTMLElement | null>;
  /** The rail's window, over which the wheel is caught: a gesture without a press belongs to the place. */
  containerRef: RefObject<HTMLElement | null>;
  /** Size of one copy of the content along the rail (px). `0` ⇒ it fits: no travel and no drag. */
  span: number;
  /** A vertical rail travels and drags along Y (tile orientation from the wave layout, DESIGN §10.1). */
  vertical: boolean;
  /** Time for one full pass of a copy — the same tempo the CSS animation used to set. */
  seconds: number;
}

/**
 * The ribbon's own motion plus hand dragging. JS drives it frame by frame rather than a CSS
 * animation, which cannot be stopped mid-way or pushed by a finger. Position moves through
 * `left`/`top`, NOT `transform` — an animated transform escapes the tile's clip (docs/pitfalls.md).
 */
export function useMarqueeDrag({ trackRef, containerRef, span, vertical, seconds }: MarqueeDragOptions) {
  const state = useRef({
    /** Current offset of the rail within a copy (px, growing "forward"). */
    offset: 0,
    /** Coasting speed after a throw (px/ms); 0 means the rail's own travel is running. */
    velocity: 0,
    /** The pointer is pressed on the rail. Tracked even for a rail that goes nowhere: this same flag
     *  tells mouse focus (the browser gives it on press) from keyboard focus. */
    pressing: false,
    /** Distance the pointer has travelled since the press, which splits a tap from a drag. */
    moved: 0,
    /** The gesture already counts as a drag ⇒ the next click is swallowed, or a drag opens a menu. */
    dragged: false,
    /** The pointer is over the rail, so its own travel stops and an item can be looked at. */
    hover: false,
    last: 0,
    samples: [] as DragSample[],
  });
  /** The "reduced motion" preference: the rail's own travel is off, but it can still be paged by hand —
   *  that movement was started by the viewer, not by the board. */
  const reduced = useRef(false);

  const axis = vertical ? "top" : "left";
  const posOf = useCallback(
    (e: { clientX: number; clientY: number }) => (vertical ? e.clientY : e.clientX),
    [vertical],
  );

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    reduced.current = mq.matches;
    const onChange = () => (reduced.current = mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // Frames: the rail's own travel and the coast after a throw. While a hand is dragging, the frame
  // computes nothing — the position is driven by `pointermove` itself.
  useEffect(() => {
    const track = trackRef.current;
    const s = state.current;
    /* The rail no longer travels (another wave, another tile size, the items fit): there can be no
       offset, and leaving one in the style is not allowed — the single copy of the content would stand
       half past the widget's edge, further with every wave switch. */
    if (!track || span <= 0) {
      if (track) track.style[axis] = "";
      s.offset = 0;
      s.velocity = 0;
      return;
    }
    const drift = driftSpeed(span, seconds);
    let frame = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      // The frame step is clamped to [0, 64]. The ceiling covers a backgrounded tab, where the
      // ribbon must not leap through everything it missed. The floor exists because the frame stamp
      // and `performance.now()` count from different origins — in jsdom the first step went negative.
      const dt = Math.min(Math.max(now - prev, 0), 64);
      prev = now;
      if (!s.pressing) {
        if (s.velocity !== 0) {
          s.offset = wrapOffset(s.offset - s.velocity * dt, span);
          s.velocity = decayVelocity(s.velocity, dt);
        } else if (!s.hover && !reduced.current) {
          s.offset = wrapOffset(s.offset + drift * dt, span);
        }
        track.style[axis] = `${-s.offset}px`;
      }
      frame = requestAnimationFrame(tick);
    };
    track.style[axis] = `${-s.offset}px`;
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [trackRef, span, seconds, axis]);

  /* A change of orientation (set by the wave, DESIGN §10.1) moves the rail to the OTHER axis, and the
     position on the previous one has to be cleared, or a vertical rail would travel by `top` while
     keeping a `left` shift and stand the items off to the side. It clears the axis it drove. */
  useEffect(() => {
    return () => {
      const track = trackRef.current;
      if (!track) return;
      track.style[axis] = "";
      /* The offset is counted in pixels of the FORMER axis, and on the new one it means a different
         distance (a copy along the height is shorter than along the width). It starts from zero. */
      state.current.offset = 0;
      state.current.velocity = 0;
    };
  }, [trackRef, axis]);

  // Dragging. The window is listened to rather than the track itself: a hand almost always leaves the
  // rail, and on `pointerleave` the gesture would break off halfway. The listeners live whether or not
  // the rail travels — a pointer release must be caught on a still one too, to clear `pressing`.
  useEffect(() => {
    const s = state.current;
    const onMove = (e: PointerEvent) => {
      const track = trackRef.current;
      if (!s.pressing || !track || span <= 0) return;
      const pos = posOf(e);
      const step = pos - s.last;
      s.last = pos;
      s.moved += Math.abs(step);
      if (s.moved > DRAG_SLOP) s.dragged = true;
      s.offset = wrapOffset(s.offset - step, span);
      track.style[axis] = `${-s.offset}px`;
      s.samples.push({ t: performance.now(), pos });
      if (s.samples.length > 8) s.samples.shift();
    };
    const onUp = () => {
      if (!s.pressing) return;
      s.pressing = false;
      s.velocity = s.dragged ? flingVelocity(s.samples) : 0;
      s.samples = [];
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [trackRef, span, axis, posOf]);

  // Wheel and trackpad on hover, to page without holding the pointer down. The listener is attached
  // by hand and NOT passive: React registers `wheel` on the root passively, so `preventDefault`
  // would silently do nothing and the ribbon would travel along with the page beneath it.
  useEffect(() => {
    const box = containerRef.current;
    // The rail fits entirely ⇒ there is nothing to page, and the wheel over the tile stays the page's.
    if (!box || span <= 0) return;
    const s = state.current;
    const onWheel = (e: WheelEvent) => {
      const track = trackRef.current;
      const delta = wheelDelta(e, vertical);
      if (!track || delta === 0) return;
      e.preventDefault();
      s.velocity = 0;
      s.offset = wrapOffset(s.offset + delta, span);
      track.style[axis] = `${-s.offset}px`;
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [containerRef, trackRef, span, vertical, axis]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const s = state.current;
      s.pressing = true;
      if (span <= 0) return;
      s.velocity = 0;
      s.moved = 0;
      s.dragged = false;
      s.last = posOf(e);
      s.samples = [{ t: performance.now(), pos: s.last }];
      // Otherwise the mouse drags the item's picture instead of the rail. On touch `preventDefault` is
      // not needed here: cross-axis page scrolling is handed to the browser through `touch-action`.
      if (e.pointerType === "mouse") e.preventDefault();
    },
    [span, posOf],
  );

  /** A click born out of a drag never reaches the item, or the rail would open a menu. */
  const onClickCapture = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    if (!state.current.dragged) return;
    state.current.dragged = false;
    e.stopPropagation();
    e.preventDefault();
  }, []);

  const onPointerEnter = useCallback(() => {
    state.current.hover = true;
  }, []);
  const onPointerLeave = useCallback(() => {
    state.current.hover = false;
  }, []);

  /** Whether the pointer is pressed right now, which tells mouse focus from keyboard focus. */
  const isPointerDown = useCallback(() => state.current.pressing, []);

  return useMemo(
    () => ({
      /** Props for the rail's window. */
      handlers: { onPointerDown, onClickCapture, onPointerEnter, onPointerLeave },
      isPointerDown,
    }),
    [onPointerDown, onClickCapture, onPointerEnter, onPointerLeave, isPointerDown],
  );
}
