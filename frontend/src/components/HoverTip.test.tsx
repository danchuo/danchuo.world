import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoverTip } from "./HoverTip";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

function tip(): HTMLElement | null {
  return document.querySelector(".hover-tip");
}
function isOpen(): boolean {
  return tip()?.dataset.open === "true";
}
function tick(ms: number) {
  act(() => void vi.advanceTimersByTime(ms));
}

describe("HoverTip", () => {
  /**
   * The card is not a label but a mini interface with its own links: the cursor has to REACH it.
   * Hiding instantly on leaving the anchor made that impossible — there is a gap between anchor
   * and card, and the pointer died exactly on it.
   */
  it("the card survives the cursor moving from the anchor onto it", () => {
    const { getByText } = render(
      <HoverTip content={<b>карточка</b>}>
        <span>якорь</span>
      </HoverTip>,
    );
    fireEvent.pointerEnter(getByText("якорь"));
    expect(isOpen()).toBe(true);

    fireEvent.pointerLeave(getByText("якорь"));
    fireEvent.pointerEnter(tip()!);
    tick(1000);
    expect(isOpen()).toBe(true);
  });

  it("and goes out when the cursor has left it too", () => {
    const { getByText } = render(
      <HoverTip content={<b>карточка</b>}>
        <span>якорь</span>
      </HoverTip>,
    );
    fireEvent.pointerEnter(getByText("якорь"));
    fireEvent.pointerLeave(getByText("якорь"));
    fireEvent.pointerEnter(tip()!);
    fireEvent.pointerLeave(tip()!);
    tick(1000);
    expect(isOpen()).toBe(false);
  });

  it("the cursor left into emptiness — the card goes out by itself, the delay is not eternal", () => {
    const { getByText } = render(
      <HoverTip content={<b>карточка</b>}>
        <span>якорь</span>
      </HoverTip>,
    );
    fireEvent.pointerEnter(getByText("якорь"));
    fireEvent.pointerLeave(getByText("якорь"));
    tick(1000);
    expect(isOpen()).toBe(false);
  });

  /** A text tooltip catches no events and earns no delay: there is no reason to hover it. */
  it("a text hint goes out at once", () => {
    const { getByText } = render(
      <HoverTip text="подпись">
        <span>якорь</span>
      </HoverTip>,
    );
    fireEvent.pointerEnter(getByText("якорь"));
    expect(isOpen()).toBe(true);
    fireEvent.pointerLeave(getByText("якорь"));
    expect(isOpen()).toBe(false);
  });
});

/**
 * A touch screen has no hover: the finger's enter and leave arrive around one tap, so a hover card
 * lived a blink and the mark's link took the visitor away. On touch a tap opens the card and keeps
 * it until a tap outside. DESIGN §7.9
 */
describe("HoverTip — a card on touch", () => {
  /** jsdom has no PointerEvent: build one from MouseEvent and set the pointer type by hand. */
  function touch(el: Element, type: string) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerType", { value: "touch" });
    fireEvent(el, event);
    return event;
  }
  /** The real order of a tap: down, enter, focus, up, leave, click. */
  function tap(el: Element) {
    touch(el, "pointerdown");
    touch(el, "pointerover");
    fireEvent.focus(el);
    touch(el, "pointerup");
    touch(el, "pointerout");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(el, click);
    return click;
  }
  function mount() {
    return render(
      <>
        <a href="https://instagram.com/x">
          <HoverTip content={<a href="https://instagram.com/p/1">пост</a>}>
            <span>марка</span>
          </HoverTip>
        </a>
        <p>снаружи</p>
      </>,
    );
  }

  it("a tap opens the card and it stays after the finger lifts", () => {
    const { getByText } = mount();
    tap(getByText("марка"));
    tick(1000);
    expect(isOpen()).toBe(true);
  });

  it("the tap does not follow the mark's link", () => {
    const { getByText } = mount();
    expect(tap(getByText("марка")).defaultPrevented).toBe(true);
  });

  it("a tap inside the card leaves it open", () => {
    const { getByText } = mount();
    tap(getByText("марка"));
    touch(getByText("пост"), "pointerdown");
    touch(getByText("пост"), "pointerout");
    tick(1000);
    expect(isOpen()).toBe(true);
  });

  it("a tap outside closes it", () => {
    const { getByText } = mount();
    tap(getByText("марка"));
    touch(getByText("снаружи"), "pointerdown");
    expect(isOpen()).toBe(false);
  });

  it("a second tap on the mark closes it", () => {
    const { getByText } = mount();
    tap(getByText("марка"));
    tap(getByText("марка"));
    expect(isOpen()).toBe(false);
  });
});
