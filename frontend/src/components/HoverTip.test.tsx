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
