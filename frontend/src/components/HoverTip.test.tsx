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
  it("карточка переживает переезд курсора с якоря на неё", () => {
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

  it("и гаснет, когда курсор ушёл уже с неё", () => {
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

  it("курсор ушёл в пустоту — карточка гаснет сама, отсрочка не вечная", () => {
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
  it("текстовая подсказка гаснет сразу", () => {
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
