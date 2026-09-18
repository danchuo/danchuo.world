"use client";

import { useEffect, useState } from "react";

/** Decoded once per source and remembered: a second mount of the same picture never waits. */
const decoded = new Set<string>();

/**
 * The wait's ceiling, in step with the paint gate (`fontGate.ts`): a request that hangs rather than
 * fails settles nothing, and a tile held back for ever is worse than one that fills in late.
 */
const IMAGE_GATE_TIMEOUT_MS = 1600;

/**
 * Has the picture ARRIVED — decoded, not merely requested. A tile drawn around one bitmap has to
 * hold itself back until then, or it appears empty and fills in front of the reader. DESIGN §7.10
 * A failure settles the wait too: a missing file must not leave the tile hidden for ever.
 */
export function useImageReady(src: string): boolean {
  const [ready, setReady] = useState(() => decoded.has(src));

  useEffect(() => {
    if (decoded.has(src)) {
      setReady(true);
      return;
    }
    let live = true;
    const settle = () => {
      decoded.add(src);
      if (live) setReady(true);
    };
    const img = new Image();
    img.src = src;
    // `decode()` waits for the pixels, `onload` only for the bytes: the gap between them is the
    // blank frame this gate exists to remove.
    if (typeof img.decode === "function") img.decode().then(settle, settle);
    else {
      img.onload = settle;
      img.onerror = settle;
    }
    const ceiling = setTimeout(settle, IMAGE_GATE_TIMEOUT_MS);
    return () => {
      live = false;
      clearTimeout(ceiling);
    };
  }, [src]);

  return ready;
}
