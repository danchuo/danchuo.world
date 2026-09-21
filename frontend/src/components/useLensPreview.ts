"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DisciplineLens } from "@/lib/disciplineLens";

/**
 * The lens TRIED ON by hovering a ledge socket (DESIGN §5.2). It opens at once and dies not when
 * the pointer leaves the socket but when it leaves the ZONE — the today tile and the calendar
 * together — so a try-on survives the trip down to the grid.
 */

/** The two tiles the try-on lives in: the one that sets it and the one that answers it. */
const ZONE = '[data-tile-id="today"], [data-tile-id="calendar"]';

/** The flight between the two tiles passes over the board itself, and must not end the try-on. */
const GRACE_MS = 180;

export interface LensPreview {
  /** What the board SHOWS: the try-on while it is up, the pinned lens otherwise. */
  lens: DisciplineLens | null;
  /** A socket met the pointer. Leaving one is not the end of the try-on — the zone is. */
  hover: (next: DisciplineLens | null) => void;
  /** Drop the try-on outright — a click pins its own lens and must not be shadowed by it. */
  clear: () => void;
}

export function useLensPreview(pinned: DisciplineLens | null): LensPreview {
  const [preview, setPreview] = useState<DisciplineLens | null>(null);
  const grace = useRef(0);

  const clear = useCallback(() => {
    window.clearTimeout(grace.current);
    setPreview(null);
  }, []);

  /* The try-on opens on the spot, with no dwell: the answer has to arrive under the pointer, or
     the gesture stops being cheaper than a click — and paging is what the click is for. */
  const hover = useCallback((next: DisciplineLens | null) => {
    // Leaving a socket for the calendar below is not leaving the try-on: the zone decides that.
    if (next === null) return;
    window.clearTimeout(grace.current);
    setPreview(next);
  }, []);

  useEffect(() => {
    if (!preview) return;
    const leaving = () => {
      window.clearTimeout(grace.current);
      grace.current = window.setTimeout(() => setPreview(null), GRACE_MS);
    };
    const onOver = (e: PointerEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest(ZONE)) {
        window.clearTimeout(grace.current);
        return;
      }
      leaving();
    };
    // Leaving the window fires no enter anywhere, so the try-on would hang on until the pointer
    // came back. `relatedTarget === null` is exactly that exit.
    const onOut = (e: PointerEvent) => {
      if (e.relatedTarget === null) leaving();
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      window.clearTimeout(grace.current);
    };
  }, [preview]);

  useEffect(() => () => window.clearTimeout(grace.current), []);

  return { lens: preview ?? pinned, hover, clear };
}
