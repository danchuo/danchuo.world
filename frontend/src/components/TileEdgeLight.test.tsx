import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TileEdgeLight } from "./TileEdgeLight";

/**
 * jsdom не каскадирует пользовательские свойства: значение, объявленное в скине волны,
 * `getComputedStyle` тут не увидит. Поэтому опт-ин подменяем — проверяем поведение шва,
 * а не движок стилей.
 */
function waveAsksForLight(on: boolean) {
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () => ({ getPropertyValue: () => (on ? "1" : "") }) as unknown as CSSStyleDeclaration,
  );
}

/** Плитка с честной коробкой: в jsdom `getBoundingClientRect` сам по себе отдаёт нули. */
function tile(id: string, box: { left: number; top: number; width: number; height: number }) {
  const el = document.createElement("div");
  el.dataset.tileId = id;
  el.getBoundingClientRect = () => ({ ...box, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) });
  document.body.appendChild(el);
  return el;
}

function move(target: Element, clientX: number, clientY: number) {
  target.dispatchEvent(new MouseEvent("pointermove", { clientX, clientY, bubbles: true }));
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("TileEdgeLight", () => {
  it("волна попросила свет — координаты курсора едут в переменные плитки", () => {
    waveAsksForLight(true);
    const el = tile("today", { left: 100, top: 50, width: 200, height: 100 });
    render(<TileEdgeLight wave="wave-03" />);

    move(el, 300, 50); // правый верхний угол
    expect(el.style.getPropertyValue("--tile-dx")).toBe("1.000");
    expect(el.style.getPropertyValue("--tile-dy")).toBe("-1.000");
  });

  it("волна свет не просит — шов молчит и не вешает слушателя", () => {
    waveAsksForLight(false);
    const el = tile("today", { left: 0, top: 0, width: 100, height: 100 });
    render(<TileEdgeLight wave="wave-01" />);

    move(el, 100, 100);
    expect(el.style.getPropertyValue("--tile-dx")).toBe("");
  });

  it("у каждой плитки своя коробка — свет не считается по соседней", () => {
    waveAsksForLight(true);
    const left = tile("today", { left: 0, top: 0, width: 100, height: 100 });
    const right = tile("sleep", { left: 500, top: 0, width: 100, height: 100 });
    render(<TileEdgeLight wave="wave-03" />);

    move(left, 100, 50);
    move(right, 500, 50);
    expect(left.style.getPropertyValue("--tile-dx")).toBe("1.000");
    expect(right.style.getPropertyValue("--tile-dx")).toBe("-1.000");
  });

  it("движение мимо плиток ничего не пишет и не падает", () => {
    waveAsksForLight(true);
    const el = tile("today", { left: 0, top: 0, width: 100, height: 100 });
    render(<TileEdgeLight wave="wave-03" />);

    move(el, 50, 50);
    expect(() => move(document.body, 5, 5)).not.toThrow();
    expect(el.style.getPropertyValue("--tile-dx")).toBe("0.000");
  });

  it("тач-указатель — шва нет вовсе: ховера на нём не бывает", () => {
    waveAsksForLight(true);
    vi.spyOn(window, "matchMedia").mockImplementation(
      (q: string) =>
        ({
          matches: q.includes("hover: none") || q.includes("pointer: coarse"),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const el = tile("today", { left: 0, top: 0, width: 100, height: 100 });
    render(<TileEdgeLight wave="wave-03" />);

    move(el, 100, 100);
    expect(el.style.getPropertyValue("--tile-dx")).toBe("");
  });
});
