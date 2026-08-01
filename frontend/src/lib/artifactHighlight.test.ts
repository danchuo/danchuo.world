import { describe, expect, it } from "vitest";
import { HIGHLIGHT_PAD, padHighlight } from "./artifactHighlight";

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
