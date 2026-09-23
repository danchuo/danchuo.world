"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  SHAFT_FRONT_HEIGHT,
  shaftLook,
  shaftWindow,
  stepShaft,
  type ShaftArtifact,
} from "@/lib/artifactShaft";

/** How much of a drag counts as one step, as a fraction of the tile's height. */
const DRAG_NOTCH = 0.3;
/** Fraction of the remaining distance travelled per frame — the same easing rate as the drop roll. */
const MOTION_RATE = 0.16;
/** Below this the object is standing still; snapping avoids an endless sub-pixel tail. */
const MOTION_EPSILON = 0.002;

interface ArtifactShaftProps {
  /** Only things with a picture: the caller filters with `shaftArtifacts`. DESIGN §7.2 */
  artifacts: ShaftArtifact[];
  /** Opens the artifact's card; the shaft itself knows nothing of the card. */
  onOpen: (index: number) => void;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The artifact shaft: objects stand in a line receding from the viewer and come forward one at a
 * time. Depth is honest perspective plus the tile's own blur, so the material does the measuring
 * and no separate gauge is needed. Only the front object is named. DESIGN §7.2, §10.2
 */
export function ArtifactShaft({ artifacts, onOpen }: ArtifactShaftProps) {
  const count = artifacts.length;
  const [target, setTarget] = useState(0);
  const [position, setPosition] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ y: number; from: number; id: number; captured: boolean } | null>(null);
  /* Outlives the gesture: `pointerup` clears the drag, and only THEN does the click arrive — with
     the flag inside the drag record every click read as a choice, including a drag's own tail. */
  const moved = useRef(false);

  // Ease towards the target; the shaft carries weight, so a step is travelled rather than jumped.
  useEffect(() => {
    if (prefersReducedMotion()) {
      setPosition(target);
      return;
    }
    let raf = 0;
    const tick = () => {
      let done = false;
      setPosition((cur) => {
        const next = cur + (target - cur) * MOTION_RATE;
        if (Math.abs(target - next) < MOTION_EPSILON) {
          done = true;
          return target;
        }
        return next;
      });
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  // The wheel is the shaft's own gesture, so the page must not scroll with it. A passive listener
  // cannot call preventDefault, and React's onWheel is passive — hence the native registration.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      const step = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!step) return;
      e.preventDefault();
      setTarget((cur) => stepShaft(cur, step > 0 ? 1 : -1, count));
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [count]);

  /* ⚠️ The pointer is NOT captured here. Capture retargets the compatibility mouse events with it,
     so `click` lands on the capturing box instead of the object under the hand — and the card could
     not be opened at all, by the object or by its name. It is taken once the gesture is a drag. */
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { y: e.clientY, from: target, id: e.pointerId, captured: false };
    moved.current = false;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const box = boxRef.current;
    if (!d || !box) return;
    const notch = box.clientHeight * DRAG_NOTCH;
    if (notch <= 0) return;
    const travelled = (e.clientY - d.y) / notch;
    if (Math.abs(travelled) > 0.12 && !d.captured) {
      // Now the hand is dragging, and it may well leave the tile — from here the box wants the
      // pointer to itself. Nothing is left to retarget: this gesture no longer ends in a click.
      d.captured = true;
      moved.current = true;
      box.setPointerCapture?.(d.id);
    }
    setTarget(stepShaft(d.from, Math.round(travelled), count));
  };

  const endDrag = () => {
    drag.current = null;
  };

  /** The object and its name are one control: a drag's tail is not a choice of artifact. */
  const open = (index: number) => {
    if (!moved.current) onOpen(index);
  };

  const frontIndex = Math.max(0, Math.min(count - 1, Math.round(position)));
  const front = artifacts[frontIndex];

  return (
    /* The sizer: fills the tile in bento and, in the stack where nothing gives it a height, takes
       its own from `aspect-ratio` (common.css, DESIGN §8). */
    <div className="artifact-shaft relative h-full w-full">
      {/* `tile-frame` is what makes this the container the caption's `cqw` sizes count from; without it
         they latch onto a distant ancestor and hit the clamp ceiling. DESIGN §8.1 */}
      <div
        ref={boxRef}
        className="tile-frame absolute touch-none select-none"
        /* `inset` breaks out of the shell's padding: the object is the widget, not a framed picture.
           ⚠️ `isolation` is load-bearing — PRIME strips the plate, so without a stacking context of its
           own the shaft's depth z-indexes outrank the card. DESIGN §7.5 */
        style={{ inset: -16, cursor: "grab", isolation: "isolate" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {shaftWindow(position, count).map((i) => {
          const look = shaftLook(i - position);
          if (!look) return null;
          const isFront = i === frontIndex;
          return (
            <div
              key={artifacts[i].name}
              aria-hidden
              data-shaft-front={isFront ? "" : undefined}
              onClick={isFront ? () => open(i) : undefined}
              className="absolute flex items-center justify-center"
              style={{
                left: `${36 + look.drift * 100}%`,
                top: `${42 - look.rise * 100}%`,
                height: `${SHAFT_FRONT_HEIGHT * 100}%`,
                aspectRatio: "1",
                transform: `translate(-50%, -50%) scale(${look.scale})`,
                opacity: look.opacity,
                filter: look.blur ? `blur(${look.blur}px)` : undefined,
                zIndex: look.zIndex,
                // Only the front object answers the cursor; the rest are depth, not targets.
                pointerEvents: isFront ? "auto" : "none",
                // The shaft as a whole is dragged; the object under the cursor also opens.
                cursor: isFront ? "pointer" : undefined,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={artifacts[i].imageUrl}
                alt=""
                draggable={false}
                className="h-full w-full"
                style={{ objectFit: "contain" }}
              />
            </div>
          );
        })}

        {front && (
          <div
            className="artifact-shaft__caption absolute bottom-0 left-0 right-0 flex p-4"
            style={{ zIndex: 1100 }}
          >
            {/* The name is the tile's only text and its keyboard control: the card stays reachable
                without a pointer, and the date belongs to the card, where there is room to read it. */}
            <button type="button" onClick={() => open(frontIndex)} className="artifact-shaft__name">
              {front.name}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
