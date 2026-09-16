import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Artifact3D } from "./Artifact3D";

vi.mock("@/lib/artifact3dStage", () => ({ mountArtifact: vi.fn() }));
import { mountArtifact } from "@/lib/artifact3dStage";
const mountMock = vi.mocked(mountArtifact);

function handle() {
  return { setSpinning: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
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

  it("снимает сцену при размонтировании — контекст не течёт", async () => {
    const h = handle();
    mountMock.mockResolvedValue(h);
    const { unmount } = render(<Artifact3D src="/m.glb" />);
    await waitFor(() => expect(mountMock).toHaveBeenCalled());

    unmount();
    await waitFor(() => expect(h.dispose).toHaveBeenCalled());
  });
});
