import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactShaft } from "./ArtifactShaft";

vi.mock("@/lib/artifact3dStage", () => ({ mountArtifact: vi.fn() }));
import { mountArtifact } from "@/lib/artifact3dStage";
const mountMock = vi.mocked(mountArtifact);

const ARTIFACTS = [
  { id: 70, name: "Кассета", imageUrl: null, firstMentionedOn: "2026-02-14", model3dUrl: "/m/Кас.glb" },
  { id: 54, name: "Ракетка", imageUrl: null, firstMentionedOn: "2026-03-10", model3dUrl: "/m/Рак.glb" },
];

afterEach(() => vi.clearAllMocks());

const handle = () => ({ setSpinning: vi.fn(), turn: vi.fn(), setLight: vi.fn(), resize: vi.fn(), dispose: vi.fn() });

function mount() {
  mountMock.mockResolvedValue(handle());
  const onOpen = vi.fn();
  const { container } = render(<ArtifactShaft artifacts={ARTIFACTS} onOpen={onOpen} />);
  const box = container.firstElementChild as HTMLElement;
  // jsdom lays nothing out, and a zero-height box makes the drag notch zero — the gesture dies.
  Object.defineProperty(box, "clientHeight", { value: 400 });
  const capture = vi.fn();
  Object.defineProperty(box, "setPointerCapture", { value: capture });
  return { onOpen, box, capture, front: container.querySelector<HTMLElement>("[data-shaft-front]")! };
}

/* jsdom has no PointerEvent, and `fireEvent.pointerDown(el, {clientY})` drops the coordinate
   entirely — a real MouseEvent under the pointer type carries it. docs/pitfalls.md */
const at = (el: HTMLElement, type: string, clientY: number) =>
  fireEvent(el, new MouseEvent(type, { clientY, bubbles: true }));

describe("ArtifactShaft", () => {
  it("открывает карточку кликом по самому предмету, а не только по подписи", async () => {
    const { onOpen, front } = mount();
    await waitFor(() => expect(mountMock).toHaveBeenCalled());

    at(front, "pointerdown", 100);
    at(front, "pointerup", 100);
    fireEvent.click(front);

    expect(onOpen).toHaveBeenCalledWith(0);
  });

  it("не открывает карточку, если предмет тянули: клик — хвост жеста", async () => {
    const { onOpen, front } = mount();
    await waitFor(() => expect(mountMock).toHaveBeenCalled());

    at(front, "pointerdown", 100);
    at(front, "pointermove", 260);
    at(front, "pointerup", 260);
    fireEvent.click(front);

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("не перехватывает указатель, пока жест не стал протяжкой", async () => {
    const { front, capture } = mount();
    await waitFor(() => expect(mountMock).toHaveBeenCalled());

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

  it("подписывает предмет только именем — без даты", async () => {
    mount();
    expect(await screen.findByRole("button", { name: "Кассета" })).toBeInTheDocument();
    expect(screen.queryByText("14.02.2026")).not.toBeInTheDocument();
  });

  it("держит подпись, пока предмет не встал: имя не приходит раньше вещи", async () => {
    let settle: (h: ReturnType<typeof handle>) => void = () => {};
    mountMock.mockReturnValue(new Promise((r) => { settle = r; }));
    render(<ArtifactShaft artifacts={ARTIFACTS} onOpen={vi.fn()} />);

    await waitFor(() => expect(mountMock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Кассета" })).not.toBeInTheDocument();

    await act(async () => settle(handle()));
    expect(await screen.findByRole("button", { name: "Кассета" })).toBeInTheDocument();
  });

  it("показывает имя и когда предмет не встал вовсе — иначе плитка немая", async () => {
    mountMock.mockRejectedValue(new Error("no webgl"));
    render(<ArtifactShaft artifacts={ARTIFACTS} onOpen={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Кассета" })).toBeInTheDocument();
  });
});
