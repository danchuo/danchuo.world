import { fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Artifact3D } from "./Artifact3D";

vi.mock("@/lib/artifact3dStage", () => ({ mountArtifact: vi.fn() }));
import { mountArtifact } from "@/lib/artifact3dStage";
const mountMock = vi.mocked(mountArtifact);

function handle() {
  return { setSpinning: vi.fn(), turn: vi.fn(), setLight: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
}

/** jsdom has no `matchMedia` — we supply the answer for the reduced-motion setting. */
function setReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => setReducedMotion(false));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLCanvasElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLCanvasElement.prototype, "offsetHeight");
});

describe("Artifact3D", () => {
  it("монтирует сцену в свой канвас", async () => {
    const h = handle();
    mountMock.mockResolvedValue(h);
    const { container } = render(<Artifact3D src="/assets/3d/wireframe-globe.glb" />);

    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
    await waitFor(() => expect(mountMock).toHaveBeenCalledTimes(1));
    expect(mountMock.mock.calls[0][0]).toBe(canvas);
    expect(mountMock.mock.calls[0][1]).toMatchObject({ src: "/assets/3d/wireframe-globe.glb" });
  });

  it("буфер канваса меряется по вёрстке, а не по тому, как предмет сейчас масштабирован", async () => {
    const h = handle();
    mountMock.mockResolvedValue(h);
    Object.defineProperty(HTMLCanvasElement.prototype, "offsetWidth", { configurable: true, get: () => 120 });
    Object.defineProperty(HTMLCanvasElement.prototype, "offsetHeight", { configurable: true, get: () => 90 });

    const { container } = render(<Artifact3D src="/m.glb" />);
    await waitFor(() => expect(mountMock).toHaveBeenCalled());

    /* A slot standing deep in the shaft is drawn scaled DOWN, and `getBoundingClientRect` reports
       that scale. Measured by it, the object kept a small buffer and stepped to the front mushy. */
    const canvas = container.querySelector("canvas")!;
    expect(canvas.width).toBe(120);
    expect(canvas.height).toBe(90);
  });

  it("в покое стоит, под курсором оживает и по уходу снова замирает", async () => {
    const h = handle();
    mountMock.mockResolvedValue(h);
    const { container } = render(<Artifact3D src="/m.glb" />);
    await waitFor(() => expect(mountMock).toHaveBeenCalled());
    const canvas = container.querySelector("canvas")!;

    // The key property: the scene does not move on its own — it is a still picture.
    expect(h.setSpinning).not.toHaveBeenCalled();

    await userEvent.hover(canvas);
    expect(h.setSpinning).toHaveBeenLastCalledWith(true);

    await userEvent.unhover(canvas);
    expect(h.setSpinning).toHaveBeenLastCalledWith(false);
  });

  it("предмет, показанный в ответ на внимание к другому месту, крутится сам", async () => {
    const h = handle();
    mountMock.mockResolvedValue(h);
    render(<Artifact3D src="/m.glb" spin />);

    await waitFor(() => expect(h.setSpinning).toHaveBeenCalledWith(true));
  });

  it("клавиатурный фокус оживляет предмет наравне с курсором", async () => {
    const h = handle();
    mountMock.mockResolvedValue(h);
    const { container } = render(<Artifact3D src="/m.glb" label="глобус" />);
    await waitFor(() => expect(mountMock).toHaveBeenCalled());
    const canvas = container.querySelector("canvas")!;

    canvas.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(h.setSpinning).toHaveBeenLastCalledWith(true);
    canvas.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(h.setSpinning).toHaveBeenLastCalledWith(false);
  });

  it("prefers-reduced-motion держит предмет неподвижным под курсором", async () => {
    setReducedMotion(true);
    const h = handle();
    mountMock.mockResolvedValue(h);
    const { container } = render(<Artifact3D src="/m.glb" />);
    await waitFor(() => expect(mountMock).toHaveBeenCalled());

    await userEvent.hover(container.querySelector("canvas")!);
    expect(h.setSpinning).not.toHaveBeenCalledWith(true);
  });

  it("сорвавшаяся сцена не оставляет битого места — слот пустеет", async () => {
    mountMock.mockRejectedValue(new Error("нет WebGL"));
    const { container } = render(<Artifact3D src="/m.glb" />);

    await waitFor(() => expect(container.querySelector("canvas")).toBeNull());
    expect(container).toBeEmptyDOMElement();
  });

  it("без подписи предмет декоративен, с подписью — картинка для читалки", async () => {
    mountMock.mockResolvedValue(handle());
    const { container, rerender } = render(<Artifact3D src="/m.glb" />);
    expect(container.querySelector("canvas")).toHaveAttribute("aria-hidden", "true");

    rerender(<Artifact3D src="/m.glb" label="голо-глобус" />);
    const labelled = container.querySelector("canvas")!;
    expect(labelled).toHaveAttribute("role", "img");
    expect(labelled).toHaveAttribute("aria-label", "голо-глобус");
    expect(labelled).not.toHaveAttribute("aria-hidden");
  });

  it("новое положение солнца правит стоящую сцену, а не пересобирает её", async () => {
    const h = handle();
    mountMock.mockResolvedValue(h);
    const { rerender } = render(<Artifact3D src="/m.glb" light={{ azimuth: 0.5, ambient: 0.26 }} />);
    await waitFor(() => expect(mountMock).toHaveBeenCalledTimes(1));

    rerender(<Artifact3D src="/m.glb" light={{ azimuth: 1.7, ambient: 0.26 }} />);

    // Rebuilding would reset the pose: a sphere turned by the cursor would jump to its start.
    expect(mountMock).toHaveBeenCalledTimes(1);
    expect(h.dispose).not.toHaveBeenCalled();
    expect(h.setLight).toHaveBeenCalledWith(1.7);
  });

  it("в режиме протяжки предмет крутится рукой, а не по наведению", async () => {
    const h = handle();
    mountMock.mockResolvedValue(h);
    const { container } = render(<Artifact3D src="/m.glb" draggable />);
    await waitFor(() => expect(mountMock).toHaveBeenCalled());
    const canvas = container.querySelector("canvas")!;

    fireEvent.pointerEnter(canvas);
    expect(h.setSpinning).not.toHaveBeenCalled();

    /* jsdom has no PointerEvent, and `fireEvent.pointerDown(el, {clientX})` drops the coordinate
       entirely — a real MouseEvent under the pointer type carries it. docs/pitfalls.md */
    const at = (type: string, clientX: number) =>
      fireEvent(canvas, new MouseEvent(type, { clientX, bubbles: true }));

    at("pointerdown", 100);
    at("pointermove", 160);
    expect(h.turn).toHaveBeenCalledTimes(1);
    expect(h.turn.mock.calls[0][0]).toBeGreaterThan(0);

    // Backwards turns the other way: the object follows the hand, it does not only ratchet forward.
    at("pointermove", 120);
    expect(h.turn.mock.calls[1][0]).toBeLessThan(0);

    // Released, the hand is off: a further move must not keep turning the object.
    at("pointerup", 120);
    h.turn.mockClear();
    at("pointermove", 300);
    expect(h.turn).not.toHaveBeenCalled();
  });

  it("рука крутит предмет в обе оси: вокруг себя и через голову", async () => {
    const h = handle();
    mountMock.mockResolvedValue(h);
    const { container } = render(<Artifact3D src="/m.glb" draggable />);
    await waitFor(() => expect(mountMock).toHaveBeenCalled());
    const canvas = container.querySelector("canvas")!;

    const drag = (type: string, clientX: number, clientY: number) =>
      fireEvent(canvas, new MouseEvent(type, { clientX, clientY, bubbles: true }));

    drag("pointerdown", 100, 100);
    drag("pointermove", 160, 100);
    // Sideways is the turn around the object's own axis; up and down does not touch it.
    expect(h.turn.mock.calls[0][0]).toBeGreaterThan(0);
    expect(h.turn.mock.calls[0][1]).toBe(0);

    drag("pointermove", 160, 40);
    // Upwards tips the object away from the viewer, and the axis it spins on stays put.
    expect(h.turn.mock.calls[1][0]).toBe(0);
    expect(h.turn.mock.calls[1][1]).toBeLessThan(0);
  });

  it("снимает сцену при размонтировании — контекст не течёт", async () => {
    const h = handle();
    mountMock.mockResolvedValue(h);
    const { unmount } = render(<Artifact3D src="/m.glb" />);
    await waitFor(() => expect(mountMock).toHaveBeenCalled());

    unmount();
    await waitFor(() => expect(h.dispose).toHaveBeenCalled());
  });
});
