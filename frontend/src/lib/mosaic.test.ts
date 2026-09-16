import { describe, expect, it } from "vitest";
import { GAP, MOSAIC_SLACK, buildMosaic, dropCardWidth, mosaicWidth } from "./mosaic";

/**
 * Slack between the mosaic and the card's edge (DESIGN §7.5). Measured on the live stack, the gap
 * was 0.00–0.02px: the layout was built flush and the engine's arithmetic decided the outcome, so
 * in Safari the right frame spilled past the card's clip. The invariant is pinned, not a number.
 */
describe("мозаика дропа — запас до края карточки есть всегда", () => {
  const PAD = 32;
  const MIN = 200;

  it("сколько ширины отпустили мозаике — столько карточка и отдаёт, плюс запас", () => {
    for (const frameW of [220, 309, 373, 500, 900]) {
      // The worst case: the mosaic filled its allowance exactly, to the last pixel.
      const budget = mosaicWidth(frameW, PAD);
      const inner = dropCardWidth(budget, frameW, PAD, MIN) - PAD;
      expect(inner - budget).toBeGreaterThanOrEqual(MOSAIC_SLACK);
    }
  });

  it("дробная ширина ряда запас не съедает", () => {
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

  it("карточка не уже минимума и не шире своей ячейки", () => {
    expect(dropCardWidth(10, 373, PAD, MIN)).toBe(MIN);
    expect(dropCardWidth(9999, 373, PAD, MIN)).toBe(373);
  });

  it("ячейка не измерена или уже собственных полей — строить нечего", () => {
    expect(mosaicWidth(0, PAD)).toBe(0);
    expect(mosaicWidth(20, PAD)).toBe(0);
  });
});

describe("buildMosaic — геометрия ячеек целочисленная", () => {
  const photo = (w: number, h: number) => ({ imageUrl: "", thumbUrl: "", width: w, height: h });

  it("ширина и высота каждой ячейки — целые пиксели", () => {
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

  it("ряд не шире отпущенной ширины — сколько бы кадров в нём ни было", () => {
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
