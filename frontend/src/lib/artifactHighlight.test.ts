import { describe, expect, it } from "vitest";
import { HIGHLIGHT_MIN, HIGHLIGHT_PAD, boxesAt, padHighlight } from "./artifactHighlight";

const box = (x0: number, y0: number, x1: number, y1: number) => ({
  artifactId: 1,
  name: "предмет",
  x0,
  y0,
  x1,
  y1,
});

describe("padHighlight", () => {
  it("расширяет на долю собственного размера в каждую сторону", () => {
    // 0.4 × 0.2 при запасе 15% ⇒ +0.06 по X и +0.03 по Y с каждой стороны.
    const r = padHighlight(box(0.3, 0.4, 0.7, 0.6), 0.15);
    expect(r.x0).toBeCloseTo(0.24, 6);
    expect(r.y0).toBeCloseTo(0.37, 6);
    expect(r.width).toBeCloseTo(0.52, 6);
    expect(r.height).toBeCloseTo(0.26, 6);
  });

  it("не вылезает за кадр у самого края", () => {
    // Предмет вплотную к левому верхнему углу: запас ушёл бы в минус.
    const r = padHighlight(box(0.0, 0.0, 0.2, 0.2), 0.5);
    expect(r.x0).toBe(0);
    expect(r.y0).toBe(0);
    expect(r.x0 + r.width).toBeLessThanOrEqual(1);
    expect(r.y0 + r.height).toBeLessThanOrEqual(1);
  });

  it("рамка во весь кадр остаётся во весь кадр", () => {
    const r = padHighlight(box(0, 0, 1, 1));
    expect(r).toEqual({ x0: 0, y0: 0, width: 1, height: 1 });
  });

  it("нулевой запас оставляет рамку как есть", () => {
    const r = padHighlight(box(0.2, 0.3, 0.5, 0.9), 0);
    expect(r.x0).toBeCloseTo(0.2, 6);
    expect(r.width).toBeCloseTo(0.3, 6);
  });

  it("по умолчанию запас — 15%", () => {
    expect(HIGHLIGHT_PAD).toBe(0.15);
    expect(padHighlight(box(0.4, 0.4, 0.6, 0.6)).width).toBeCloseTo(0.26, 6);
  });
});

describe("padHighlight — минимальный размер рамки", () => {
  it("крошечная находка дорастает до минимума вокруг своего центра", () => {
    // Очки на общем плане: 2% кадра. Запас 15% от 2% ничего не решает — рамку не видно.
    const r = padHighlight(box(0.5, 0.5, 0.52, 0.52));
    expect(r.width).toBeCloseTo(HIGHLIGHT_MIN, 4);
    expect(r.height).toBeCloseTo(HIGHLIGHT_MIN, 4);
    // Центр находки не съезжает — рамка растёт в обе стороны одинаково.
    expect(r.x0 + r.width / 2).toBeCloseTo(0.51, 4);
    expect(r.y0 + r.height / 2).toBeCloseTo(0.51, 4);
  });

  it("рост у края кадра сдвигает рамку внутрь, а не режет её", () => {
    // В углу симметричный рост ушёл бы за кадр: минимум важнее центровки, иначе у самого
    // края рамка снова оказалась бы меньше минимума.
    const r = padHighlight(box(0, 0, 0.01, 0.01));
    expect(r.x0).toBe(0);
    expect(r.y0).toBe(0);
    expect(r.width).toBeCloseTo(HIGHLIGHT_MIN, 4);
    expect(r.height).toBeCloseTo(HIGHLIGHT_MIN, 4);

    const far = padHighlight(box(0.99, 0.99, 1, 1));
    expect(far.x0 + far.width).toBeCloseTo(1, 4);
    expect(far.width).toBeCloseTo(HIGHLIGHT_MIN, 4);
  });

  it("минимум работает по каждой оси отдельно", () => {
    // Очки — широкие и очень плоские: ширины хватает, высоту надо поднимать.
    const r = padHighlight(box(0.2, 0.5, 0.8, 0.51), 0);
    expect(r.width).toBeCloseTo(0.6, 4);
    expect(r.height).toBeCloseTo(HIGHLIGHT_MIN, 4);
  });

  it("крупную находку минимум не трогает", () => {
    const r = padHighlight(box(0.2, 0.3, 0.5, 0.9), 0);
    expect(r.width).toBeCloseTo(0.3, 6);
    expect(r.height).toBeCloseTo(0.6, 6);
  });

  it("минимум отключаем нулём — данные не подменяются молча", () => {
    const r = padHighlight(box(0.5, 0.5, 0.52, 0.52), 0, 0);
    expect(r.width).toBeCloseTo(0.02, 6);
  });
});

describe("boxesAt — какие рамки под курсором", () => {
  const named = (name: string, x0: number, y0: number, x1: number, y1: number) => ({
    ...box(x0, y0, x1, y1),
    name,
  });
  const left = named("очки", 0.1, 0.1, 0.4, 0.4);
  const right = named("футболка", 0.6, 0.6, 0.9, 0.9);
  const over = named("ракетка", 0.3, 0.3, 0.7, 0.7);

  it("на пустом месте — ни одной", () => {
    expect(boxesAt([left, right], 0.5, 0.05)).toEqual([]);
  });

  it("две находки на кадре: отдаётся та, под которой курсор", () => {
    expect(boxesAt([left, right], 0.2, 0.2).map((b) => b.name)).toEqual(["очки"]);
    expect(boxesAt([left, right], 0.8, 0.8).map((b) => b.name)).toEqual(["футболка"]);
  });

  it("на пересечении рамок отдаются обе — выбирать за зрителя мы не вправе", () => {
    expect(boxesAt([left, over], 0.35, 0.35).map((b) => b.name)).toEqual(["очки", "ракетка"]);
  });

  it("судим по НАРИСОВАННОЙ рамке, а не по сырой находке", () => {
    // Рамка шире находки на запас и дотянута до минимума — курсор в этом «воздухе» тоже
    // считается наведением, иначе подсказка не ловилась бы там, где рамку видно.
    const tiny = named("очки", 0.5, 0.5, 0.51, 0.51);
    expect(boxesAt([tiny], 0.545, 0.5).map((b) => b.name)).toEqual(["очки"]);
    expect(boxesAt([tiny], 0.7, 0.7)).toEqual([]);
  });
});
