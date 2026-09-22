import { describe, expect, it } from "vitest";
import { GAP, MOSAIC_SLACK, buildMosaic, dropCardWidth, mosaicWidth } from "./mosaic";

/**
 * Slack between the mosaic and the card's edge (DESIGN §7.5). Measured on the live stack, the gap
 * was 0.00–0.02px: the layout was built flush and the engine's arithmetic decided the outcome, so
 * in Safari the right frame spilled past the card's clip. The invariant is pinned, not a number.
 */
describe("the drop mosaic always has a margin to the card's edge", () => {
  const PAD = 32;
  const MIN = 200;

  it("the card gives the mosaic as much width as it was allotted, plus a margin", () => {
    for (const frameW of [220, 309, 373, 500, 900]) {
      // The worst case: the mosaic filled its allowance exactly, to the last pixel.
      const budget = mosaicWidth(frameW, PAD);
      const inner = dropCardWidth(budget, frameW, PAD, MIN) - PAD;
      expect(inner - budget).toBeGreaterThanOrEqual(MOSAIC_SLACK);
    }
  });

  it("a fractional row width does not eat the margin", () => {
    // Cell widths are always fractional — derived from frame proportions, not set by hand. The
    // precondition matters: a row cannot be wider than what the mosaic was built for.
    for (const frameW of [220, 309, 373, 500, 900]) {
      const budget = mosaicWidth(frameW, PAD);
      for (const k of [1, 0.999, 0.87, 0.5, 0.13]) {
        const used = budget * k;
        const inner = dropCardWidth(used, frameW, PAD, MIN) - PAD;
        expect(inner - used).toBeGreaterThanOrEqual(MOSAIC_SLACK);
      }
    }
  });

  it("the card is no narrower than the minimum and no wider than its cell", () => {
    expect(dropCardWidth(10, 373, PAD, MIN)).toBe(MIN);
    expect(dropCardWidth(9999, 373, PAD, MIN)).toBe(373);
  });

  it("the cell is not measured or is narrower than its own margins — nothing to build", () => {
    expect(mosaicWidth(0, PAD)).toBe(0);
    expect(mosaicWidth(20, PAD)).toBe(0);
  });
});

describe("buildMosaic — cell geometry is integer", () => {
  const photo = (w: number, h: number) => ({ imageUrl: "", thumbUrl: "", width: w, height: h });

  it("each cell's width and height are whole pixels", () => {
    // Each box's fractional width is rounded by the engine in its own way: a row of four frames
    // gained up to ~4px over the calculation, ate the slack and was clipped in Safari.
    for (const n of [1, 2, 3, 4, 5, 7]) {
      const photos = Array.from({ length: n }, (_, i) => photo(120 + i * 37, 80 + i * 11));
      const rows = buildMosaic(photos, 341, 260);
      expect(rows).not.toBeNull();
      for (const row of rows!) {
        for (const cell of row) {
          expect(Number.isInteger(cell.w)).toBe(true);
          expect(Number.isInteger(cell.h)).toBe(true);
        }
      }
    }
  });

  it("the row is no wider than the allotted width — however many frames are in it", () => {
    // A row of four is the very case everything broke on.
    for (const n of [2, 3, 4, 5, 8]) {
      const photos = Array.from({ length: n }, (_, i) => photo(200 + i * 53, 130 + i * 7));
      const W = 341;
      const rows = buildMosaic(photos, W, 260)!;
      for (const row of rows) {
        const used = row.reduce((s, c) => s + c.w, 0) + (row.length - 1) * GAP;
        expect(used).toBeLessThanOrEqual(W);
      }
    }
  });
});
