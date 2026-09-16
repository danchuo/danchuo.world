import { describe, expect, it } from "vitest";
import {
  DRAG_DEADZONE,
  HIGHLIGHT_MIN,
  HIGHLIGHT_PAD,
  boxFromDrag,
  boxesAt,
  padHighlight,
} from "./artifactHighlight";

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
    // 0.4 × 0.2 with a 15% margin ⇒ +0.06 on X and +0.03 on Y each side.
    const r = padHighlight(box(0.3, 0.4, 0.7, 0.6), 0.15);
    expect(r.x0).toBeCloseTo(0.24, 6);
    expect(r.y0).toBeCloseTo(0.37, 6);
    expect(r.width).toBeCloseTo(0.52, 6);
    expect(r.height).toBeCloseTo(0.26, 6);
  });

  it("не вылезает за кадр у самого края", () => {
    // An item flush with the top left corner: the margin would go negative.
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
    // Sunglasses in a wide shot: 2% of the frame. A 15% margin on 2% decides nothing — the box
    // would not be visible.
    const r = padHighlight(box(0.5, 0.5, 0.52, 0.52));
    expect(r.width).toBeCloseTo(HIGHLIGHT_MIN, 4);
    expect(r.height).toBeCloseTo(HIGHLIGHT_MIN, 4);
    // The finding's centre does not drift — the box grows equally both ways.
    expect(r.x0 + r.width / 2).toBeCloseTo(0.51, 4);
    expect(r.y0 + r.height / 2).toBeCloseTo(0.51, 4);
  });

  it("рост у края кадра сдвигает рамку внутрь, а не режет её", () => {
    // In a corner symmetric growth would leave the frame: the minimum outranks centring, or at the
    // very edge the box would again fall below it.
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
    // Sunglasses are wide and very flat: the width suffices, the height must be raised.
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

describe("boxFromDrag — рамка из протяжки мышью", () => {
  it("протяжка становится рамкой независимо от направления", () => {
    const forward = boxFromDrag({ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.8 });
    // The drag may start from any corner — the box is the same.
    expect(boxFromDrag({ x: 0.6, y: 0.8 }, { x: 0.2, y: 0.3 })).toEqual(forward);
    expect(forward).toEqual({ x0: 0.2, y0: 0.3, x1: 0.6, y1: 0.8 });
  });

  it("курсор, ушедший за край кадра, рамку за кадр не уводит", () => {
    // A mouse easily leaves the picture — the backend would reject such a box (coordinates outside 0..1).
    const r = boxFromDrag({ x: -0.4, y: 0.5 }, { x: 1.9, y: 1.4 })!;
    expect(r.x0).toBe(0);
    expect(r.y0).toBe(0.5);
    expect(r.x1).toBe(1);
    expect(r.y1).toBe(1);
  });

  it("крошечная протяжка дорастает до минимума вокруг своего центра", () => {
    const r = boxFromDrag({ x: 0.5, y: 0.5 }, { x: 0.53, y: 0.52 })!;
    expect(r.x1 - r.x0).toBeCloseTo(HIGHLIGHT_MIN, 4);
    expect(r.y1 - r.y0).toBeCloseTo(HIGHLIGHT_MIN, 4);
    expect((r.x0 + r.x1) / 2).toBeCloseTo(0.515, 4);
    expect((r.y0 + r.y1) / 2).toBeCloseTo(0.51, 4);
  });

  it("минимум у края кадра сдвигает рамку внутрь, а не режет её", () => {
    const r = boxFromDrag({ x: 0, y: 0 }, { x: 0.02, y: 0.02 })!;
    expect(r.x0).toBe(0);
    expect(r.x1).toBeCloseTo(HIGHLIGHT_MIN, 4);
    const far = boxFromDrag({ x: 0.99, y: 0.99 }, { x: 1, y: 1 })!;
    expect(far.x1).toBeCloseTo(1, 4);
    expect(far.x1 - far.x0).toBeCloseTo(HIGHLIGHT_MIN, 4);
  });

  it("минимум работает по каждой оси отдельно", () => {
    // A flat drag along sunglasses: the width suffices, the height is raised.
    const r = boxFromDrag({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.505 })!;
    expect(r.x1 - r.x0).toBeCloseTo(0.6, 4);
    expect(r.y1 - r.y0).toBeCloseTo(HIGHLIGHT_MIN, 4);
  });

  it("клик без протяжки рамкой не становится", () => {
    // Otherwise any stray touch of the frame would create a finding the size of the minimum.
    expect(boxFromDrag({ x: 0.4, y: 0.4 }, { x: 0.4, y: 0.4 })).toBeNull();
    const jitter = DRAG_DEADZONE / 2;
    expect(boxFromDrag({ x: 0.4, y: 0.4 }, { x: 0.4 + jitter, y: 0.4 + jitter })).toBeNull();
  });

  it("протяжка по одной оси — намеренная, рамка получается", () => {
    // A thin strip along the item: far on X, barely moved on Y.
    const r = boxFromDrag({ x: 0.1, y: 0.4 }, { x: 0.7, y: 0.4 });
    expect(r).not.toBeNull();
    expect(r!.y1 - r!.y0).toBeCloseTo(HIGHLIGHT_MIN, 4);
  });

  it("крупную протяжку не трогает вовсе", () => {
    expect(boxFromDrag({ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.7 })).toEqual({
      x0: 0.1,
      y0: 0.1,
      x1: 0.9,
      y1: 0.7,
    });
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
    // The box is wider than the finding by the margin and stretched to the minimum, and the cursor
    // in that air counts as a hover — otherwise the hint would not catch where the box is visible.
    const tiny = named("очки", 0.5, 0.5, 0.51, 0.51);
    expect(boxesAt([tiny], 0.545, 0.5).map((b) => b.name)).toEqual(["очки"]);
    expect(boxesAt([tiny], 0.7, 0.7)).toEqual([]);
  });
});
