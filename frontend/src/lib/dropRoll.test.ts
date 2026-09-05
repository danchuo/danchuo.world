import { describe, expect, it } from "vitest";
import {
  nearestFrameIndex,
  rollMotionStep,
  startFrameIndex,
  stripPadding,
  tickIndexAt,
  toothHeight,
  wheelStep,
} from "./dropRoll";

describe("nearestFrameIndex", () => {
  const centers = [58, 180, 302, 424, 546];

  it("берёт кадр, чей центр ближе к середине окна", () => {
    expect(nearestFrameIndex(centers, 190)).toBe(1);
    expect(nearestFrameIndex(centers, 290)).toBe(2);
  });

  it("на краях отдаёт крайние кадры", () => {
    expect(nearestFrameIndex(centers, 0)).toBe(0);
    expect(nearestFrameIndex(centers, 9999)).toBe(4);
  });

  it("при равном расстоянии оставляет тот, что раньше в ленте", () => {
    expect(nearestFrameIndex(centers, 119)).toBe(0);
  });

  it("пустая лента ⇒ 0 (кадра нет, но индекс обязан быть)", () => {
    expect(nearestFrameIndex([], 100)).toBe(0);
  });
});

describe("startFrameIndex", () => {
  const photos = [{ imageUrl: "/a" }, { imageUrl: "/b" }, { imageUrl: "/c" }];

  it("открывает ИМЕННО тот кадр, что показывала плитка", () => {
    expect(startFrameIndex(photos, "/c")).toBe(2);
  });

  it("без адреса — первый кадр", () => {
    expect(startFrameIndex(photos)).toBe(0);
    expect(startFrameIndex(photos, null)).toBe(0);
  });

  it("адрес не из этого дропа ⇒ первый кадр, а не пустота", () => {
    expect(startFrameIndex(photos, "/z")).toBe(0);
    expect(startFrameIndex([], "/a")).toBe(0);
  });
});

describe("stripPadding", () => {
  it("боковой запас = полокна минус полкадра: крайние кадры встают по центру", () => {
    expect(stripPadding(500, 116)).toBe(192);
  });

  it("кадр шире окна ⇒ запаса нет (иначе лента уедет в минус)", () => {
    expect(stripPadding(100, 116)).toBe(0);
  });

  it("окно ещё не измерено ⇒ 0", () => {
    expect(stripPadding(0, 116)).toBe(0);
  });
});

describe("wheelStep", () => {
  it("щелчок мыши = ровно один кадр, сколько бы пикселей он ни принёс", () => {
    expect(wheelStep(0, 100, 0, 0)).toEqual({ dir: 1, acc: 0 });
    expect(wheelStep(0, -240, 0, 0)).toEqual({ dir: -1, acc: 0 });
  });

  it("мелкие дельты трекпада копятся и дают кадр только вместе", () => {
    const a = wheelStep(0, 12, 0, 0);
    expect(a).toEqual({ dir: 0, acc: 12 });
    const b = wheelStep(0, 12, 0, a.acc);
    expect(b).toEqual({ dir: 0, acc: 24 });
    const c = wheelStep(0, 20, 0, b.acc);
    expect(c).toEqual({ dir: 1, acc: 0 });
  });

  it("горизонтальный жест трекпада листает так же, как вертикальный", () => {
    expect(wheelStep(-100, 0, 0, 0)).toEqual({ dir: -1, acc: 0 });
  });

  it("дельта в строках (Firefox) переводится в пиксели", () => {
    expect(wheelStep(0, 3, 1, 0)).toEqual({ dir: 1, acc: 0 });
  });

  it("нулевое событие ничего не меняет", () => {
    expect(wheelStep(0, 0, 0, 17)).toEqual({ dir: 0, acc: 17 });
  });

  it("смена направления не тянет за собой накопленное в другую сторону", () => {
    const a = wheelStep(0, 20, 0, 0);
    const b = wheelStep(0, -20, 0, a.acc);
    expect(b).toEqual({ dir: 0, acc: 0 });
  });
});


describe("toothHeight", () => {
  it("прямо под курсором засечка вырастает до потолка", () => {
    expect(toothHeight(0, 78, 8, 30)).toBe(30);
  });

  it("за радиусом магнита засечка стоит на своей высоте", () => {
    expect(toothHeight(78, 78, 8, 30)).toBe(8);
    expect(toothHeight(400, 78, 8, 30)).toBe(8);
  });

  it("на половине радиуса добирает ровно половину прибавки (косинус в квадрате)", () => {
    expect(toothHeight(39, 78, 8, 30)).toBeCloseTo(19, 6);
  });

  it("спад симметричен: сторона курсора не важна", () => {
    expect(toothHeight(-30, 78, 8, 30)).toBe(toothHeight(30, 78, 8, 30));
  });

  it("у текущего кадра своя, большая база — под магнитом он не проваливается", () => {
    expect(toothHeight(78, 78, 26, 30)).toBe(26);
    expect(toothHeight(0, 78, 26, 30)).toBe(30);
  });

  it("радиус ещё не измерен ⇒ высота базовая, а не деление на ноль", () => {
    expect(toothHeight(0, 0, 8, 30)).toBe(8);
  });
});

describe("tickIndexAt", () => {
  it("засечка под курсором: ряд поделён на равные доли", () => {
    expect(tickIndexAt(0, 370, 37)).toBe(0);
    expect(tickIndexAt(105, 370, 37)).toBe(10);
    expect(tickIndexAt(369, 370, 37)).toBe(36);
  });

  it("промах за край ряда отдаёт крайнюю засечку, а не пустоту", () => {
    expect(tickIndexAt(-40, 370, 37)).toBe(0);
    expect(tickIndexAt(9999, 370, 37)).toBe(36);
  });

  it("ряд ещё не измерен ⇒ первая засечка", () => {
    expect(tickIndexAt(100, 0, 37)).toBe(0);
    expect(tickIndexAt(100, 370, 0)).toBe(0);
  });
});

describe("rollMotionStep", () => {
  const cell = 124;

  it("в полупикселе от цели — встаёт ровно на неё, а не дрожит вечно", () => {
    expect(rollMotionStep(1000.3, 1000, 16.7, cell)).toBe(1000);
  });

  it("за кадр приближается к цели и никогда не проскакивает её", () => {
    const right = rollMotionStep(1000, 1124, 16.7, cell);
    expect(right).toBeGreaterThan(1000);
    expect(right).toBeLessThan(1124);
    const left = rollMotionStep(1124, 1000, 16.7, cell);
    expect(left).toBeLessThan(1124);
    expect(left).toBeGreaterThan(1000);
  });

  it("чем дальше отстала лента, тем большую ДОЛЮ пути берёт за кадр: быстрый щелчок догоняется быстрее", () => {
    const near = rollMotionStep(0, cell, 16.7, cell) / cell;
    const far = rollMotionStep(0, cell * 6, 16.7, cell) / (cell * 6);
    expect(far).toBeGreaterThan(near);
  });

  it("доля растёт не без предела: очень далёкая цель всё ещё не берётся одним прыжком", () => {
    expect(rollMotionStep(0, cell * 40, 16.7, cell)).toBeLessThan(cell * 40 * 0.6);
  });

  it("зависший кадр отрисовки не превращается в прыжок: время считается не больше чем за два кадра", () => {
    expect(rollMotionStep(0, cell, 200, cell)).toBeCloseTo(rollMotionStep(0, cell, 1000 / 30, cell), 6);
  });

  it("нулевое время — лента на месте", () => {
    expect(rollMotionStep(500, 1000, 0, cell)).toBe(500);
  });
});
