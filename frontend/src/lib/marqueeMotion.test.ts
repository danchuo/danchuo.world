import { describe, expect, it } from "vitest";
import {
  DRAG_SLOP,
  FLING_MAX,
  FLING_MIN,
  decayVelocity,
  driftSpeed,
  flingVelocity,
  WHEEL_LINE_PX,
  WHEEL_PAGE_PX,
  wheelDelta,
  wrapOffset,
} from "./marqueeMotion";

describe("wrapOffset — лента бесконечна в обе стороны", () => {
  it("смещение внутри копии остаётся как есть", () => {
    expect(wrapOffset(0, 500)).toBe(0);
    expect(wrapOffset(120, 500)).toBe(120);
  });

  it("уехали вперёд за копию — возвращаемся в её начало", () => {
    expect(wrapOffset(500, 500)).toBe(0);
    expect(wrapOffset(620, 500)).toBe(120);
  });

  it("уехали НАЗАД за ноль — заходим с конца копии, а не упираемся в край", () => {
    // This is what the positive remainder is for: paging back is endless, as forward is, or the
    // ribbon would stall at the start of its single loop.
    expect(wrapOffset(-1, 500)).toBe(499);
    expect(wrapOffset(-620, 500)).toBe(380);
  });

  it("копии нет (лента влезла) или счёт поехал — смещение нулевое, без NaN", () => {
    for (const span of [0, -10, Number.NaN]) expect(wrapOffset(120, span)).toBe(0);
    expect(wrapOffset(Number.NaN, 500)).toBe(0);
  });
});

describe("flingVelocity — бросок считается по концу протяжки", () => {
  it("равномерная протяжка → её же скорость (px/мс)", () => {
    const v = flingVelocity([
      { t: 0, pos: 0 },
      { t: 50, pos: 50 },
      { t: 100, pos: 100 },
    ]);
    expect(v).toBeCloseTo(1, 3);
  });

  it("знак сохраняется: назад — отрицательная скорость", () => {
    expect(flingVelocity([{ t: 0, pos: 100 }, { t: 100, pos: 0 }])).toBeCloseTo(-1, 3);
  });

  it("палец остановился перед отпусканием ⇒ броска нет", () => {
    // Measuring across the whole drag is wrong: "moved it there and held" points at a place rather
    // than throwing, and on release the ribbon must stay where it was left.
    const v = flingVelocity([
      { t: 0, pos: 0 },
      { t: 400, pos: 300 },
      { t: 480, pos: 300 },
      { t: 500, pos: 300 },
    ]);
    expect(v).toBe(0);
  });

  it("две точки в один миг (события пришли пачкой) не дают бесконечной скорости", () => {
    // Measured on the live board: pointer events sent back to back landed within fractions of a
    // millisecond, and an honest derivative threw the ribbon hundreds of copies ahead in one frame.
    const v = flingVelocity([
      { t: 0, pos: 0 },
      { t: 0.2, pos: -50 },
    ]);
    expect(Math.abs(v)).toBeLessThanOrEqual(FLING_MAX);
    expect(v).toBeLessThan(0); // the throw's direction is preserved
  });

  it("одна точка или нулевой промежуток → ноль, без деления на ноль", () => {
    expect(flingVelocity([{ t: 10, pos: 5 }])).toBe(0);
    expect(flingVelocity([])).toBe(0);
    expect(flingVelocity([{ t: 10, pos: 0 }, { t: 10, pos: 40 }])).toBe(0);
  });
});

describe("decayVelocity — бросок гаснет по времени, а не по числу кадров", () => {
  it("за одно и то же время затухание одинаково при любом fps", () => {
    const one = decayVelocity(1, 32);
    const two = decayVelocity(decayVelocity(1, 16), 16);
    expect(one).toBeCloseTo(two, 3);
  });

  it("медленный остаток обнуляется, чтобы лента не ползла вечно", () => {
    expect(decayVelocity(FLING_MIN / 2, 16)).toBe(0);
  });

  it("живой бросок замедляется, но не разворачивается", () => {
    const v = decayVelocity(2, 16);
    expect(v).toBeLessThan(2);
    expect(v).toBeGreaterThan(0);
  });
});

describe("driftSpeed — собственный ход ленты", () => {
  it("копия проезжает ровно за отведённое время", () => {
    const speed = driftSpeed(600, 30); // px/ms
    expect(speed * 30_000).toBeCloseTo(600, 6);
  });

  it("нечего проезжать (копии нет) → лента стоит", () => {
    expect(driftSpeed(0, 30)).toBe(0);
    expect(driftSpeed(600, 0)).toBe(0);
  });
});

describe("DRAG_SLOP", () => {
  it("порог протяжки заметно больше дрожи руки на тапе", () => {
    expect(DRAG_SLOP).toBeGreaterThanOrEqual(4);
    expect(DRAG_SLOP).toBeLessThanOrEqual(12);
  });
});

describe("wheelDelta — лента крутится колесом/тачпадом при наведении", () => {
  it("горизонтальная лента: поперечный свайп тачпада листает её на пройденные пиксели", () => {
    expect(wheelDelta({ deltaX: 40, deltaY: 0, deltaMode: 0 }, false)).toBe(40);
    expect(wheelDelta({ deltaX: -40, deltaY: 0, deltaMode: 0 }, false)).toBe(-40);
  });

  it("обычное колесо (только вниз/вверх) тоже листает горизонтальную ленту", () => {
    // A mouse has no cross axis at all, and a trackpad's habitual gesture is vertical. Give the
    // ribbon only its own axis and "spin it on hover" would work for almost nobody.
    expect(wheelDelta({ deltaX: 0, deltaY: 50, deltaMode: 0 }, false)).toBe(50);
  });

  it("диагональный жест идёт по своей главной оси, а не суммой", () => {
    expect(wheelDelta({ deltaX: 30, deltaY: -8, deltaMode: 0 }, false)).toBe(30);
    expect(wheelDelta({ deltaX: 8, deltaY: -30, deltaMode: 0 }, false)).toBe(-30);
  });

  it("вертикальная лента считает главной свою ось", () => {
    // Equal deltas are a tie, and the tie goes to the ribbon's own axis.
    expect(wheelDelta({ deltaX: 30, deltaY: 30, deltaMode: 0 }, true)).toBe(30);
    expect(wheelDelta({ deltaX: 30, deltaY: 30, deltaMode: 0 }, false)).toBe(30);
    expect(wheelDelta({ deltaX: 8, deltaY: 30, deltaMode: 0 }, true)).toBe(30);
  });

  it("дельта в строках и страницах переводится в пиксели", () => {
    // Firefox sends wheel deltas in lines (deltaMode 1), not pixels: without converting, the
    // ribbon would crawl three pixels per click.
    expect(wheelDelta({ deltaX: 0, deltaY: 3, deltaMode: 1 }, false)).toBe(3 * WHEEL_LINE_PX);
    expect(wheelDelta({ deltaX: 0, deltaY: 1, deltaMode: 2 }, false)).toBe(WHEEL_PAGE_PX);
  });

  it("счёт поехал — дельта нулевая, без NaN", () => {
    expect(wheelDelta({ deltaX: Number.NaN, deltaY: Number.NaN, deltaMode: 0 }, false)).toBe(0);
  });
});
