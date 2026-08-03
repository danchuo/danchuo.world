import { describe, expect, it } from "vitest";
import { MOSAIC_UNITS, columnMajorMosaic, type MosaicCell } from "./dropMosaic";

/** Кадры дропа: `true` — стоячий. */
const land = (n: number) => Array(n).fill(false);
/** Последовательность ориентаций живого дропа (37 кадров) — на ней и судим о раскладке. */
const REAL = "LLLLLLLLPLLLPPLLLLLPLLLLPLLLLLLLLLPLP".split("").map((c) => c === "P");

/** Клетки, занятые кадром. */
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
    // 8 лежачих на 12 клеток ширины = 4 клетки высоты, то есть по два кадра в колонке.
    const cells = columnMajorMosaic(land(8), MOSAIC_UNITS);
    expect(cells[2]).toMatchObject({ col: 3, row: 0 });
    expect(cells[3]).toMatchObject({ col: 3, row: 2 });
  });

  it("оба кадра занимают по шесть клеток — вес у ориентаций равный", () => {
    const cells = columnMajorMosaic([false, true], MOSAIC_UNITS);
    expect(cells[0]).toMatchObject({ w: 3, h: 2 });
    expect(cells[1]).toMatchObject({ w: 2, h: 3 });
  });

  /** Главный запрет: кадры не наезжают друг на друга ни при какой смеси ориентаций. */
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
   * Щель рядом со стоячим кадром занимает следующий подходящий, а не «конец колонки»: без этого
   * щели складывались в пустую колонку во всю высоту мозаики.
   */
  it("кадр садится в щель, оставленную стоячим соседом", () => {
    // Стоячий кадр занимает клетки 0..1, тринадцатая клетка колонки свободна — её и займёт
    // следующий лежачий, начавшись со второй клетки, а не с третьей.
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
