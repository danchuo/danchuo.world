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
}

/** Canvas pixel density: past double there is no visible gain, and it costs four times as much. */
const MAX_DPR = 2;

export function Artifact3D({ src, label, className, style, rpm, padding }: Artifact3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ArtifactHandle | null>(null);
  const [failed, setFailed] = useState(false);

  // Mount: wait until the slot is on screen, and only then fetch the library and the model.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const abort = new AbortController();
    let disposed = false;

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const box = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(box.width * dpr));
      const h = Math.max(1, Math.round(box.height * dpr));
      if (canvas.width === w && canvas.height === h) return false;
      canvas.width = w;
      canvas.height = h;
      return true;
    };

    const start = () => {
      fit();
      mountArtifact(canvas, { src, rpm, padding, signal: abort.signal })
        .then((handle) => {
          if (disposed) {
            handle.dispose();
            return;
          }
          handleRef.current = handle;
        })
        .catch(() => {
          if (!disposed) setFailed(true);
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
  }, [src, rpm, padding]);

  const spin = (on: boolean) => {
    if (on && prefersReducedMotion()) return;
    handleRef.current?.setSpinning(on);
  };

  if (failed) return null;

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={style}
      // Cursor and focus are the only controls: the board never moves by itself.
      onPointerEnter={() => spin(true)}
      onPointerLeave={() => spin(false)}
      onFocus={() => spin(true)}
      onBlur={() => spin(false)}
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
