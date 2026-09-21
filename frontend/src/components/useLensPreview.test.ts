import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLensPreview } from "./useLensPreview";

const STRETCH = { key: "stretch", occurrence: 1, label: "растяжка" };
const READING = { key: "reading", occurrence: 1, label: "чтение" };

/** A node inside the zone, and one outside it — the try-on's whole life is told by these two. */
function zone(id: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-tile-id", id);
  document.body.appendChild(el);
  return el;
}

// jsdom has no `PointerEvent` constructor; the hook reads only `target` and `relatedTarget`,
// which a mouse event carries just as well.
function pointerOver(target: EventTarget) {
  act(() => {
    target.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  });
}

describe("примерка линзы", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("наведение открывает примерку сразу: ответ обязан приехать под курсор", () => {
    const { result } = renderHook(() => useLensPreview(null));

    act(() => result.current.hover(STRETCH));

    expect(result.current.lens).toEqual(STRETCH);
  });

  it("соседнее гнездо подменяет примерку, а не копит их", () => {
    const { result } = renderHook(() => useLensPreview(null));

    act(() => result.current.hover(STRETCH));
    act(() => result.current.hover(READING));

    expect(result.current.lens).toEqual(READING);
  });

  it("примерка держится, пока курсор в зоне — иначе календарь под ней не полистать", () => {
    const calendar = zone("calendar");
    const { result } = renderHook(() => useLensPreview(null));

    act(() => result.current.hover(STRETCH));
    // Down from the socket into the calendar: the socket is left, the zone is not.
    act(() => result.current.hover(null));
    pointerOver(calendar);
    act(() => vi.advanceTimersByTime(1000));

    expect(result.current.lens).toEqual(STRETCH);
  });

  it("уход из зоны снимает примерку, но не мгновенно — между плитками есть зазор", () => {
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    const { result } = renderHook(() => useLensPreview(null));

    act(() => result.current.hover(STRETCH));
    pointerOver(outside);
    expect(result.current.lens).toEqual(STRETCH);

    act(() => vi.advanceTimersByTime(200));
    expect(result.current.lens).toBeNull();
  });

  it("перелёт между плитками зоны примерку не роняет", () => {
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    const calendar = zone("calendar");
    const { result } = renderHook(() => useLensPreview(null));

    act(() => result.current.hover(STRETCH));
    pointerOver(outside);
    act(() => vi.advanceTimersByTime(100));
    pointerOver(calendar);
    act(() => vi.advanceTimersByTime(1000));

    expect(result.current.lens).toEqual(STRETCH);
  });

  it("под примеркой видно её, а под ней — закреплённую линзу", () => {
    const { result } = renderHook(() => useLensPreview(READING));

    expect(result.current.lens).toEqual(READING);

    act(() => result.current.hover(STRETCH));
    expect(result.current.lens).toEqual(STRETCH);

    act(() => result.current.clear());
    expect(result.current.lens).toEqual(READING);
  });
});
