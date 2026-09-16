/**
 * The light-catching edge — the pure part of the hover. Only geometry lives here: a pointer inside
 * a tile's box becomes a vector from its centre in `[-1, 1]`. What to do with that vector is the
 * SKIN's decision. Split so the geometry is testable without a DOM. DESIGN §10.2
 */

/** A tile's rectangle — exactly the subset of `DOMRect` the calculation needs. */
export interface TileBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The vector from the tile's centre to the pointer, per axis in `[-1, 1]`. */
export interface EdgeVector {
  dx: number;
  dy: number;
}

/**
 * `null` means the tile has no box (hidden by a wave, not yet mounted): there is nothing to divide
 * by and nowhere to write the variables.
 */
export function edgeVector(box: TileBox, clientX: number, clientY: number): EdgeVector | null {
  if (box.width <= 0 || box.height <= 0) return null;
  return {
    dx: clamp((clientX - box.left) / box.width * 2 - 1),
    dy: clamp((clientY - box.top) / box.height * 2 - 1),
  };
}

/** The pointer can leave the edge between rAF frames; unclamped, the highlight would come away. */
function clamp(v: number): number {
  return Math.min(1, Math.max(-1, v));
}
