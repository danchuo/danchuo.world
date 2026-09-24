import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactShaft } from "./ArtifactShaft";

const ARTIFACTS = [
  { id: 70, name: "Кассета", imageUrl: "/a/Кас.png", firstMentionedOn: "2026-02-14" },
  { id: 54, name: "Ракетка", imageUrl: "/a/Рак.png", firstMentionedOn: "2026-03-10" },
];

afterEach(() => vi.clearAllMocks());

function mount() {
  const onOpen = vi.fn();
  const { container } = render(<ArtifactShaft artifacts={ARTIFACTS} onOpen={onOpen} />);
  const box = container.querySelector(".artifact-shaft > .tile-frame") as HTMLElement;
  // jsdom lays nothing out, and a zero-height box makes the drag notch zero — the gesture dies.
  Object.defineProperty(box, "clientHeight", { value: 400 });
  const capture = vi.fn();
  Object.defineProperty(box, "setPointerCapture", { value: capture });
  return { onOpen, box, capture, container, front: container.querySelector<HTMLElement>("[data-shaft-front]")! };
}

/* jsdom has no PointerEvent, and `fireEvent.pointerDown(el, {clientY})` drops the coordinate
   entirely — a real MouseEvent under the pointer type carries it. docs/pitfalls.md */
const at = (el: HTMLElement, type: string, clientY: number) =>
  fireEvent(el, new MouseEvent(type, { clientY, bubbles: true }));

describe("ArtifactShaft", () => {
  it("opens the card by a click on the item itself, not only on the caption", () => {
    const { onOpen, front } = mount();

    at(front, "pointerdown", 100);
    at(front, "pointerup", 100);
    fireEvent.click(front);

    expect(onOpen).toHaveBeenCalledWith(0);
  });

  it("does not open the card if the item was dragged: the click is the gesture's tail", () => {
    const { onOpen, front } = mount();

    at(front, "pointerdown", 100);
    at(front, "pointermove", 260);
    at(front, "pointerup", 260);
    fireEvent.click(front);

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not capture the pointer until the gesture becomes a drag", () => {
    const { front, capture } = mount();

    /* Capture retargets the compatibility mouse events too, `click` among them: taken on the press,
       it carries the click off the object onto the box, and nothing can open the card. */
    at(front, "pointerdown", 100);
    expect(capture).not.toHaveBeenCalled();

    // The hand is dragging now, and it may leave the tile — from here the capture is wanted.
    at(front, "pointermove", 260);
    expect(capture).toHaveBeenCalledTimes(1);

    at(front, "pointermove", 300);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("captions the item with its name only — no date", async () => {
    mount();
    expect(await screen.findByRole("button", { name: "Кассета" })).toBeInTheDocument();
    expect(screen.queryByText("14.02.2026")).not.toBeInTheDocument();
  });

  it("puts the items' pictures into the shaft, not models", () => {
    const { container } = mount();
    const srcs = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(srcs).toEqual(["/a/Кас.png", "/a/Рак.png"]);
  });

  it("pages by the calendar's wheel arithmetic: a trackpad volley is one step, not one per event", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    const three = [...ARTIFACTS, { id: 12, name: "Кеды", imageUrl: "/a/Ке.png", firstMentionedOn: "2026-04-01" }];
    const { container } = render(<ArtifactShaft artifacts={three} onOpen={vi.fn()} />);
    const box = container.querySelector(".artifact-shaft > .tile-frame") as HTMLElement;

    for (let i = 0; i < 5; i++) fireEvent.wheel(box, { deltaY: 30 });

    expect(screen.getByRole("button", { name: "Ракетка" })).toBeTruthy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
