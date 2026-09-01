import { describe, expect, it } from "vitest";
import { MOSAIC_SLACK, dropCardWidth, mosaicWidth } from "./mosaic";

/**
 * Запас между мозаикой и краем карточки (DESIGN §7.5). Замер на живом стенде показал зазор
 * 0.00–0.02px: раскладка строилась впритык, и исход решала арифметика движка — у Safari
 * правый кадр вылезал за клип карточки. Здесь закреплён сам инвариант, а не подобранное число.
 */
describe("мозаика дропа — запас до края карточки есть всегда", () => {
  const PAD = 32;
  const MIN = 200;

  it("сколько ширины отпустили мозаике — столько карточка и отдаёт, плюс запас", () => {
    for (const frameW of [220, 309, 373, 500, 900]) {
      // Худший случай: мозаика заполнила отпущенное ровно, до последнего пикселя.
      const budget = mosaicWidth(frameW, PAD);
      const inner = dropCardWidth(budget, frameW, PAD, MIN) - PAD;
      expect(inner - budget).toBeGreaterThanOrEqual(MOSAIC_SLACK);
    }
  });

  it("дробная ширина ряда запас не съедает", () => {
    // Ширины ячеек всегда дробные — они выведены из пропорций кадров, а не заданы руками.
    // Предусловие важно: ряд не может быть шире того, подо что мозаику и строили, —
    // `buildMosaic` заполняет отпущенную ширину, но за неё не выходит.
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
