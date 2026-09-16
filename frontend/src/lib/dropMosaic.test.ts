import { describe, expect, it } from "vitest";
import { MOSAIC_UNITS, columnMajorMosaic, type MosaicCell } from "./dropMosaic";

/** A drop's frames: `true` means portrait. */
const land = (n: number) => Array(n).fill(false);
/** The orientation sequence of a real drop (37 frames) — the layout is judged on it. */
const REAL = "LLLLLLLLPLLLPPLLLLLPLLLLPLLLLLLLLLPLP".split("").map((c) => c === "P");

/** The cells a frame occupies. */
function* unitsOf(c: MosaicCell) {
  for (let r = c.row; r < c.row + c.h; r++) for (let x = c.col; x < c.col + c.w; x++) yield `${r},${x}`;
}

describe("columnMajorMosaic", () => {
  it("первый кадр — сверху слева, второй под ним", () => {
    const cells = columnMajorMosaic(land(8), MOSAIC_UNITS);
    expect(cells[0]).toMatchObject({ col: 0, row: 0 });
    expect(cells[1]).toMatchObject({ col: 0, row: 2 });
  });

  it("колонка кончилась — следующий кадр начинает соседнюю сверху", () => {
    // 8 landscape frames over 12 cells of width = 4 cells of height, so two frames per column.
    const cells = columnMajorMosaic(land(8), MOSAIC_UNITS);
    expect(cells[2]).toMatchObject({ col: 3, row: 0 });
    expect(cells[3]).toMatchObject({ col: 3, row: 2 });
  });

  it("оба кадра занимают по шесть клеток — вес у ориентаций равный", () => {
    const cells = columnMajorMosaic([false, true], MOSAIC_UNITS);
    expect(cells[0]).toMatchObject({ w: 3, h: 2 });
    expect(cells[1]).toMatchObject({ w: 2, h: 3 });
  });

  /** The main prohibition: frames never overlap, whatever the mix of orientations. */
  it("кадры не перекрываются и не вылезают за сетку", () => {
    for (const units of [MOSAIC_UNITS, 6]) {
      const seen = new Set<string>();
      for (const c of columnMajorMosaic(REAL, units)) {
        expect(c.col + c.w).toBeLessThanOrEqual(units);
        for (const u of unitsOf(c)) {
          expect(seen.has(u)).toBe(false);
          seen.add(u);
        }
      }
    }
  });

  /**
   * A gap beside a portrait frame is taken by the next frame that fits rather than "the end of the
   * column": without that the gaps added up into an empty column the full height of the mosaic.
   */
  it("кадр садится в щель, оставленную стоячим соседом", () => {
    // The portrait frame takes cells 0..1 and the column's thirteenth cell is free, so the next
    // landscape frame takes it, starting from the second cell rather than the third.
    const cells = columnMajorMosaic([true, false, false, false], MOSAIC_UNITS);
    expect(cells[0]).toMatchObject({ col: 0, row: 0, w: 2, h: 3 });
    expect(cells.some((c) => c.col === 2)).toBe(true);
  });

  it("на живом дропе пустоты остаётся меньше десятой части", () => {
    const cells = columnMajorMosaic(REAL, MOSAIC_UNITS);
    const height = Math.max(...cells.map((c) => c.row + c.h));
    const filled = cells.reduce((s, c) => s + c.w * c.h, 0);
    expect(filled / (height * MOSAIC_UNITS)).toBeGreaterThan(0.9);
  });

  it("порядок кадров сохраняется — раскладка их не переставляет", () => {
    const mixed = [false, true, false, true, false];
    const cells = columnMajorMosaic(mixed, MOSAIC_UNITS);
    expect(cells).toHaveLength(mixed.length);
    mixed.forEach((portrait, i) => expect(cells[i].w).toBe(portrait ? 2 : 3));
  });

  it("пустой дроп — пустая раскладка, без деления на ноль", () => {
    expect(columnMajorMosaic([], MOSAIC_UNITS)).toEqual([]);
  });
});
