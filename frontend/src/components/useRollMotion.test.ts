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

describe("useRollMotion — moving the ribbon to a cell", () => {
  it("an instant order puts the cell in the middle of the window and starts no motion", () => {
    const el = reel(10, 78, 246);
    const { result } = mount(el);
    act(() => result.current.jump(4));
    // Cell 4 sits at 312px, the window is 246px, the cell 78px ⇒ 312 − (246 − 78) / 2 = 228.
    expect(el.scrollTop).toBe(228);
    expect(result.current.target()).toBeNull();
  });

  it("while the ribbon moves, the order remembers the FRAME, not the position: a chain of clicks does not stall", () => {
    const el = reel(10, 78, 246);
    const { result } = mount(el);
    act(() => result.current.to(3));
    expect(result.current.target()).toBe(3);
    // A second click arrives while the reel is still moving: it merely moves the target further.
    act(() => result.current.to(4));
    expect(result.current.target()).toBe(4);
  });

  it("removes snapping for the duration of the motion and restores it when the ribbon stops", () => {
    const el = reel(10, 78, 246);
    const { result } = mount(el);
    act(() => result.current.to(3));
    expect(el.style.scrollSnapType).toBe("none");
    act(() => result.current.stop());
    expect(el.style.scrollSnapType).toBe("");
    expect(result.current.target()).toBeNull();
  });

  it("the remote is stable between renders: callers' listeners are not rebuilt", () => {
    const { result, rerender } = mount(reel(3, 78, 246));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
