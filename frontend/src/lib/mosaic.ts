/**
 * Justified layout of photo-drop frames (DESIGN §7.5) — pure arithmetic, kept apart from the
 * component: `LatestDropTile.tsx` must export only components, or Fast Refresh loses state on edit.
 */

import type { FilmPhotoView } from "@/lib/api/types";

export interface Cell {
  photo: FilmPhotoView;
  w: number;
  h: number;
}

/** Gap between mosaic frames (px) — the same in the arithmetic and in the row's markup. */
export const GAP = 6;

/**
 * Slack between the mosaic and the card's inner edge. NOT cosmetic but an INVARIANT: a justified
 * layout fills the given width exactly, cell widths are fractional, every nested box rounds its own
 * way, and in Safari the sum exceeded the inner width and clipped the right frame.
 */
export const MOSAIC_SLACK = 2;

/** The width the mosaic is built for: the cell minus the card's padding AND its slack. */
export function mosaicWidth(frameW: number, padX: number): number {
  return Math.max(0, frameW - padX - MOSAIC_SLACK);
}

/**
 * Card width for a finished mosaic: shrunk to its widest row, but no narrower than the minimum and
 * no wider than its cell. The row rounds UP — the fractional remainder must go to the card rather
 * than eat into the slack.
 */
export function dropCardWidth(usedW: number, frameW: number, padX: number, minW: number): number {
  const hug = Math.ceil(usedW) + padX + MOSAIC_SLACK;
  return Math.min(frameW, Math.max(hug, minW));
}
/* A full 5-photo strip in a single row reads ugly (owner's call) — cap rows at 4 photos.
   A compliant split always exists (one photo per row at worst), so no re-sampling needed. */
const MAX_PER_ROW = 4;

const aspectOf = (p: FilmPhotoView) => (p.width && p.height && p.height > 0 ? p.width / p.height : 1);

/** Split frames into [rows] adjacent rows, balancing the sum of ratios for even row heights. */
function balancedRows(photos: FilmPhotoView[], rows: number): FilmPhotoView[][] {
  const target = photos.reduce((s, p) => s + aspectOf(p), 0) / rows;
  const groups: FilmPhotoView[][] = [];
  let cur: FilmPhotoView[] = [];
  let curSum = 0;
  for (let i = 0; i < photos.length; i++) {
    cur.push(photos[i]);
    curSum += aspectOf(photos[i]);
    const itemsLeft = photos.length - 1 - i;
    const rowsLeft = rows - groups.length - 1; // the rows after this one
    // A row closes once the target sum is reached and enough frames remain for the rows still to come.
    if (curSum >= target && rowsLeft > 0 && itemsLeft >= rowsLeft) {
      groups.push(cur);
      cur = [];
      curSum = 0;
    }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * A justified mosaic: frames are packed into rows filling the width, and the number of rows is
 * chosen so the natural height lands closest to the widget's. Every cell keeps its frame's exact
 * ratio, so nothing is cropped or distorted. `null` while the container is unmeasured.
 */
export function buildMosaic(photos: FilmPhotoView[], W: number, H: number): Cell[][] | null {
  if (W <= 0 || H <= 0 || photos.length === 0) return null;
  let best: { rows: Cell[][]; score: number } | null = null;

  for (let r = 1; r <= photos.length; r++) {
    const groups = balancedRows(photos, r);
    if (groups.length !== r) continue;
    if (groups.some((g) => g.length > MAX_PER_ROW)) continue;

    const rowH = groups.map((g) => {
      const sa = g.reduce((s, p) => s + aspectOf(p), 0);
      return (W - (g.length - 1) * GAP) / sa; // the height at which the row fills the width
    });
    const totalH = rowH.reduce((s, h) => s + h, 0) + (r - 1) * GAP;
    // The closer the natural height is to the widget's, the less empty space on either axis.
    const score = Math.min(totalH, H) / Math.max(totalH, H);
    if (best && score <= best.score) continue;

    const scale = Math.min(1, H / totalH); // do not let it exceed the height
    // Cell sizes are WHOLE pixels, and that is not calculation hygiene. The engine rounds a
    // fractional width per box in its own way: a row of four frames gathered ~4px over the
    // calculation, ate the slack and clipped in Safari. Rounding DOWN — never wider than computed.
    const rows: Cell[][] = groups.map((g, i) => {
      const h = Math.floor(rowH[i] * scale);
      return g.map((photo) => ({ photo, w: Math.floor(aspectOf(photo) * h), h }));
    });
    best = { rows, score };
  }
  return best?.rows ?? null;
}
