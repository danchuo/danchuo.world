/**
 * Layout of frames in the drop modal — a pure calculation kept out of the component, which must
 * export only components or Fast Refresh loses state. A frame takes whole grid cells, six either
 * way, so orientations weigh the same; order runs down COLUMNS and gaps are filled. DESIGN §7.5
 */

/** Cells across the grid: 12 gives four landscape frames per row, a narrow 6 gives two. */
export const MOSAIC_UNITS = 12;
export const MOSAIC_UNITS_NARROW = 6;
/** Below this window width four frames per row make a frame smaller than a touch target. */
export const MOSAIC_NARROW_PX = 520;

/** A landscape frame is 3×2 and a portrait one 2×3 — both six cells. */
const LAND = { w: 3, h: 2 };
const PORT = { w: 2, h: 3 };

export interface MosaicCell {
  /** Cell of the top-left corner, from zero. */
  col: number;
  row: number;
  w: number;
  h: number;
}

/**
 * Lay the frames out on a grid [units] cells wide. [portraits] is each frame's orientation in the
 * order they were shot (`true` is portrait); that order is preserved and the layout never reorders
 * them — only where each one sits changes.
 */
export function columnMajorMosaic(portraits: boolean[], units: number): MosaicCell[] {
  if (portraits.length === 0 || units < LAND.w) return [];

  // The ideal height: how many cells the frames would take lying with not one gap. The layout starts
  // there and grows by a cell only when a frame found no room anywhere, so the mosaic neither stretches
  // into a long column nor leaves rows that are plainly surplus.
  let limit = Math.ceil((portraits.length * LAND.w * LAND.h) / units);
  const taken: boolean[][] = [];

  const rowOf = (row: number): boolean[] => {
    while (taken.length <= row) taken.push(new Array<boolean>(units).fill(false));
    return taken[row];
  };
  const free = (col: number, row: number, w: number, h: number): boolean => {
    for (let r = row; r < row + h; r++) {
      const line = rowOf(r);
      for (let c = col; c < col + w; c++) if (line[c]) return false;
    }
    return true;
  };
  const occupy = (col: number, row: number, w: number, h: number): void => {
    for (let r = row; r < row + h; r++) {
      const line = rowOf(r);
      for (let c = col; c < col + w; c++) line[c] = true;
    }
  };

  const cells: MosaicCell[] = [];
  for (const portrait of portraits) {
    const { w, h } = portrait ? PORT : LAND;
    let placed: MosaicCell | null = null;
    // The search order is reading order: left first, then up. Hence "the second frame under the first" —
    // a neighbouring column comes into play only once the current one has no room left.
    while (!placed) {
      for (let col = 0; col + w <= units && !placed; col++) {
        for (let row = 0; row + h <= limit; row++) {
          if (free(col, row, w, h)) {
            placed = { col, row, w, h };
            break;
          }
        }
      }
      if (!placed) limit += 1;
    }
    occupy(placed.col, placed.row, placed.w, placed.h);
    cells.push(placed);
  }
  return cells;
}
