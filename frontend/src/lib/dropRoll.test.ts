import { describe, expect, it } from "vitest";
import {
  nearestFrameIndex,
  scrollFromPointer,
  sliderGeometry,
  startFrameIndex,
  stripPadding,
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

describe("sliderGeometry", () => {
  it("ползунок занимает ту же долю дорожки, что видимая часть ленты", () => {
    expect(sliderGeometry(0, 500, 1000, 400, 24)).toEqual({ width: 200, offset: 0 });
  });

  it("в конце ленты ползунок прижат к концу дорожки", () => {
    expect(sliderGeometry(500, 500, 1000, 400, 24)).toEqual({ width: 200, offset: 200 });
  });

  it("в середине — ровно посередине", () => {
    expect(sliderGeometry(250, 500, 1000, 400, 24)).toEqual({ width: 200, offset: 100 });
  });

  it("на длинном дропе ползунок не тоньше минимума — за него надо уметь схватиться", () => {
    const g = sliderGeometry(0, 500, 20000, 400, 24);
    expect(g.width).toBe(24);
  });

  it("лента влезает целиком ⇒ ползунок во всю дорожку", () => {
    expect(sliderGeometry(0, 500, 500, 400, 24)).toEqual({ width: 400, offset: 0 });
  });
});

describe("scrollFromPointer", () => {
  it("клик по началу дорожки уводит ленту в начало", () => {
    expect(scrollFromPointer(0, 400, 200, 500, 1000)).toBe(0);
  });

  it("клик по концу — в конец", () => {
    expect(scrollFromPointer(400, 400, 200, 500, 1000)).toBe(500);
  });

  it("клик по середине — на середину прокрутки", () => {
    expect(scrollFromPointer(200, 400, 200, 500, 1000)).toBe(250);
  });

  it("промах за дорожку не уводит ленту за её края", () => {
    expect(scrollFromPointer(-90, 400, 200, 500, 1000)).toBe(0);
    expect(scrollFromPointer(9999, 400, 200, 500, 1000)).toBe(500);
  });
});
