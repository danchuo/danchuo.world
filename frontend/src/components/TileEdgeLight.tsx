"use client";

import { useEffect } from "react";
import { edgeVector, type TileBox } from "@/lib/tileEdgeLight";
import { useCoarsePointer } from "./useCoarsePointer";

/**
 * The light-catching tile edge — a SHARED SEAM rather than part of any one wave. It is opt-in
 * through a custom property, so a wave that does not want it attaches no listener at all and a
 * single tile can opt out. ONE listener for the document, with the tile's box cached. DESIGN §10.2
 */
export function TileEdgeLight({ wave }: { wave: string | null }) {
  // A touch device has no hover, so this effect cannot fire there in principle.
  const coarse = useCoarsePointer();

  useEffect(() => {
    if (coarse || typeof window === "undefined") return;
    // The wave did not ask, so we leave before the listener. Computed style has to be read: the value
    // is declared in the wave's skin rather than inline.
    if (getComputedStyle(document.documentElement).getPropertyValue("--tile-edge-light").trim() !== "1") {
      return;
    }
    // Reduced motion: the light stays but stops travelling — with no variables the `inset` shadow
    // lands at zero offset, i.e. an even glow along the whole edge (see wave-03.css).
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let hovered: HTMLElement | null = null;
    let box: TileBox | null = null;
    let lit = false;

    const onMove = (e: PointerEvent) => {
      const tile = (e.target as Element | null)?.closest<HTMLElement>("[data-tile-id]") ?? null;
      if (!tile) {
        hovered = null;
        box = null;
        return;
      }
      if (tile !== hovered) {
        hovered = tile;
        box = tile.getBoundingClientRect();
        // The same opt-in as at the root, asked of the tile: the property inherits, so a tile says
        // "1" by default and any may decline with a `0` in the skin. Read BESIDE the box
        // measurement and only on entering — computed style costs the browser a recalculation.
        lit = getComputedStyle(tile).getPropertyValue("--tile-edge-light").trim() === "1";
      }
      // A tile that draws no light gets nothing written to it. This is an INVARIANT, not a saving:
      // the variables INHERIT, so a write marks the tile's whole subtree for recalculation on every
      // mouse move, and WebKit additionally re-rasterises background images (docs/pitfalls.md).
      if (!lit) return;
      const v = box && edgeVector(box, e.clientX, e.clientY);
      if (!v) return;
      tile.style.setProperty("--tile-dx", v.dx.toFixed(3));
      tile.style.setProperty("--tile-dy", v.dy.toFixed(3));
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
    // `wave` is in the dependencies: a wave swap changes `--tile-edge-light`, so the opt-in is reread.
  }, [coarse, wave]);

  return null;
}
