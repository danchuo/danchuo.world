"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { mountArtifact, type ArtifactHandle } from "@/lib/artifact3dStage";

/**
 * A 3D artifact — a universal board element that is a still picture at rest and comes alive under
 * the cursor. It loads ONLY when visible, shares one WebGL context, and stays silent on failure:
 * it is decoration, never content. Not the `artifacts` slice's records. DESIGN §12.5
 */
export interface Artifact3DProps {
  /** Address of the model (`.glb`/`.gltf`). */
  src: string;
  /**
   * Label for a screen reader. Unset means the item is decorative (`aria-hidden`) — which is how
   * it stands in a project row, where the title beside it already carries the same address.
   */
  label?: string;
  className?: string;
  style?: CSSProperties;
  /** Revolutions per minute under the cursor. */
  rpm?: number;
  /** Padding around the item: 1 means flush with the slot's edge. */
  padding?: number;
  /**
   * Turn the item by dragging instead of spinning it on hover. For places where the item is the
   * subject rather than decoration — the artifact card, where it is there to be examined.
   */
  draggable?: boolean;
  /**
   * Turn while merely SHOWN, for an item that appears in answer to attention paid elsewhere — a
   * card over a find on a frame. Otherwise the cursor rules, which is the board's default.
   */
  spin?: boolean;
  /** Light from one direction instead of the studio pair (DESIGN §7.7). Its azimuth may move later. */
  light?: { azimuth: number; ambient: number; intensity?: number };
  /** Multiplier on the studio lights: evens out a model whose texture is brighter than its row. */
  brightness?: number;
  /** Resting pose in degrees: `yaw` to the viewer's right, `pitch` tips the top, `roll` in the frame. */
  pose?: { yaw?: number; pitch?: number; roll?: number };
  /**
   * Fired once the item has finished trying, with whether it stood up. Callers that caption the
   * item wait for it; callers with a flat fallback switch to it on `false`.
   */
  onSettled?: (mounted: boolean) => void;
}

/** Radians per pixel dragged: a drag across ~520px turns the object once. */
const TURN_PER_PX = (2 * Math.PI) / 520;

/** Canvas pixel density: past double there is no visible gain, and it costs four times as much. */
const MAX_DPR = 2;

export function Artifact3D({
  src, label, className, style, rpm, padding, draggable, spin: policy, light, brightness, pose, onSettled,
}: Artifact3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ArtifactHandle | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [failed, setFailed] = useState(false);
  /* Through a ref rather than the effect's dependencies: an inline callback is a new function on
     every render, and in the list it would remount the scene — and refetch the model — each time. */
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const always = useRef(false);
  always.current = policy === true && !prefersReducedMotion();
  /* Likewise by ref: the sun moves from day to day, and a remount would refetch the model and snap
     the body back to its starting pose. The mount reads the current value, the effect below steers
     the standing scene. DESIGN §7.7 */
  const sun = useRef(light);
  sun.current = light;
  // Read at mount only, by ref for the reason above: an inline literal would remount every render.
  const rest = useRef(pose);
  rest.current = pose;

  // Mount: wait until the slot is on screen, and only then fetch the library and the model.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const abort = new AbortController();
    let disposed = false;

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      /* ⚠️ The LAYOUT box, not `getBoundingClientRect`: the rect carries the CSS transform, so an
         object standing deep in the shaft took a small buffer and came forward mushy. DESIGN §7.2 */
      const w = Math.max(1, Math.round(canvas.offsetWidth * dpr));
      const h = Math.max(1, Math.round(canvas.offsetHeight * dpr));
      if (canvas.width === w && canvas.height === h) return false;
      canvas.width = w;
      canvas.height = h;
      return true;
    };

    const start = () => {
      fit();
      mountArtifact(canvas, { src, rpm, padding, light: sun.current, brightness, pose: rest.current, signal: abort.signal })
        .then((handle) => {
          if (disposed) {
            handle.dispose();
            return;
          }
          handleRef.current = handle;
          // The day may have turned while the model travelled; the scene takes today's sun.
          if (sun.current) handle.setLight(sun.current.azimuth);
          if (always.current) handle.setSpinning(true);
          settled.current?.(true);
        })
        .catch(() => {
          if (disposed) return;
          setFailed(true);
          // A caption held back for an object that will never come would leave the tile mute.
          settled.current?.(false);
        });
    };

    // With no observer (an old browser, jsdom in tests) load at once: an extra request beats an
    // empty slot.
    if (typeof IntersectionObserver === "undefined") {
      start();
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            start();
          }
        },
        { rootMargin: "200px" },
      );
      io.observe(canvas);
      abort.signal.addEventListener("abort", () => io.disconnect());
    }

    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (fit()) handleRef.current?.resize();
          });
    ro?.observe(canvas);

    return () => {
      disposed = true;
      abort.abort();
      ro?.disconnect();
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [src, rpm, padding, brightness]);

  // A new day moves the sun without touching the body: the phase changes, the turn carries on.
  useEffect(() => {
    if (light) handleRef.current?.setLight(light.azimuth);
  }, [light?.azimuth]);

  // A late change of mind: the mount above catches the item that is already spinning when it arrives.
  useEffect(() => {
    handleRef.current?.setSpinning(always.current);
  }, [policy]);

  const spin = (on: boolean) => {
    if (on && prefersReducedMotion()) return;
    handleRef.current?.setSpinning(on);
  };

  if (failed) return null;

  if (draggable) {
    return (
      <canvas
        ref={canvasRef}
        className={className}
        style={{ cursor: "grab", touchAction: "none", ...style }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const from = drag.current;
          if (!from) return;
          // Up tips the object AWAY from the viewer, which is where the hand pushed it.
          handleRef.current?.turn((e.clientX - from.x) * TURN_PER_PX, (e.clientY - from.y) * TURN_PER_PX);
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={style}
      // Cursor and focus are the only controls: the board never moves by itself. An item already
      // turning because it is shown has nothing to answer them with.
      onPointerEnter={policy ? undefined : () => spin(true)}
      onPointerLeave={policy ? undefined : () => spin(false)}
      onFocus={policy ? undefined : () => spin(true)}
      onBlur={policy ? undefined : () => spin(false)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

/**
 * The setting is read at hover time rather than on mount: a visitor may turn it on mid-session,
 * and the board must freeze at once instead of waiting for a reload.
 */
function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
