import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { useRollMotion } from "./useRollMotion";

/**
 * A reel of [count] cells of [size] pixels in a [window]. Nobody computes geometry in jsdom, so
 * the measurements are set by hand — what is checked is the request arithmetic, not the layout.
 */
function reel(count: number, size: number, window: number): HTMLElement {
  const el = document.createElement("ul");
  define(el, "clientHeight", window);
  define(el, "scrollHeight", size * count);
  for (let i = 0; i < count; i += 1) {
    const li = document.createElement("li");
    define(li, "offsetTop", i * size);
    define(li, "offsetHeight", size);
    el.append(li);
  }
  document.body.append(el);
  return el;
}

function define(node: HTMLElement, prop: string, value: number) {
  Object.defineProperty(node, prop, { configurable: true, value });
}

function mount(el: HTMLElement) {
  const ref = createRef<HTMLElement>() as { current: HTMLElement | null };
  ref.current = el;
  return renderHook(() => useRollMotion(ref, "y"));
}

describe("useRollMotion — движение ленты к ячейке", () => {
  it("мгновенный заказ ставит ячейку в середину окна и не начинает движения", () => {
    const el = reel(10, 78, 246);
    const { result } = mount(el);
    act(() => result.current.jump(4));
    // Cell 4 sits at 312px, the window is 246px, the cell 78px ⇒ 312 − (246 − 78) / 2 = 228.
    expect(el.scrollTop).toBe(228);
    expect(result.current.target()).toBeNull();
  });

  it("пока лента едет, заказ помнит КАДР, а не положение: цепочка щелчков не топчется", () => {
    const el = reel(10, 78, 246);
    const { result } = mount(el);
    act(() => result.current.to(3));
    expect(result.current.target()).toBe(3);
    // A second click arrives while the reel is still moving: it merely moves the target further.
    act(() => result.current.to(4));
    expect(result.current.target()).toBe(4);
  });

  it("на время движения снимает защёлкивание и возвращает его, когда лента встала", () => {
    const el = reel(10, 78, 246);
    const { result } = mount(el);
    act(() => result.current.to(3));
    expect(el.style.scrollSnapType).toBe("none");
    act(() => result.current.stop());
    expect(el.style.scrollSnapType).toBe("");
    expect(result.current.target()).toBeNull();
  });

  it("пульт стабилен между рендерами: слушатели звонящих не пересобираются", () => {
    const { result, rerender } = mount(reel(3, 78, 246));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
