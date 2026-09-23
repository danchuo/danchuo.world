import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DropRoll } from "./DropRoll";
import type { FilmPhotoView } from "@/lib/api/types";

const photos: FilmPhotoView[] = [
  { imageUrl: "/api/film-media/1/0/web", thumbUrl: "/api/film-media/1/0/thumb", width: 1600, height: 1083, artifacts: [] },
  { imageUrl: "/api/film-media/1/1/web", thumbUrl: "/api/film-media/1/1/thumb", width: 1083, height: 1600, artifacts: [] },
  {
    imageUrl: "/api/film-media/1/2/web",
    thumbUrl: "/api/film-media/1/2/thumb",
    width: 1600,
    height: 1083,
    artifacts: [
      { artifactId: 7, name: "футболка", x0: 0.2, y0: 0.3, x1: 0.4, y1: 0.6, imageUrl: "/artifacts/7.png" },
    ],
  },
];

/** Finds wait for the full frame, so tests about them load it first. */
const loadFrame = (container: HTMLElement) =>
  fireEvent.load(container.querySelector(".drop-roll__photo") as HTMLImageElement);

describe("DropRoll", () => {
  it("opens on the frame clicked in the tile, not from the start of the drop", () => {
    render(<DropRoll photos={photos} startAt="/api/film-media/1/2/web" onZoom={() => {}} />);

    expect(screen.getByRole("button", { name: "кадр 3" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("кадр 03 / 3")).toBeInTheDocument();
  });

  it("without a frame address opens the first one", () => {
    render(<DropRoll photos={photos} onZoom={() => {}} />);

    expect(screen.getByRole("button", { name: "кадр 1" })).toHaveAttribute("aria-current", "true");
  });

  it("shows the current frame's finds and their count", () => {
    const { container } = render(<DropRoll photos={photos} startAt="/api/film-media/1/2/web" onZoom={() => {}} />);
    loadFrame(container);

    expect(screen.getByText("находок: 1")).toBeInTheDocument();
    expect(screen.getByText("футболка")).toBeInTheDocument();
  });

  /* A phone has no hover: a tap is the finger's "hand on the find", and a tap beside it lets go. */
  it("a touch tap on a find takes it into focus, a tap past every find releases it", () => {
    const { container } = render(<DropRoll photos={photos} startAt="/api/film-media/1/2/web" onZoom={() => {}} />);
    loadFrame(container);
    const stage = container.querySelector(".drop-roll__stage") as HTMLElement;
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
    const tap = (x: number, y: number) => {
      fireEvent.pointerDown(stage, { pointerId: 1, pointerType: "touch", clientX: x, clientY: y });
      fireEvent.pointerUp(stage, { pointerId: 1, pointerType: "touch", clientX: x, clientY: y });
    };
    const find = () => container.querySelector(".artifact-box") as HTMLElement;

    tap(30, 45);
    expect(find()).toHaveAttribute("data-shown");
    tap(90, 90);
    expect(find()).not.toHaveAttribute("data-shown");
  });

  it("the compatibility mouseleave a browser sends after a tap does not drop the focus", () => {
    const { container } = render(<DropRoll photos={photos} startAt="/api/film-media/1/2/web" onZoom={() => {}} />);
    loadFrame(container);
    const stage = container.querySelector(".drop-roll__stage") as HTMLElement;
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
    fireEvent.pointerDown(stage, { pointerId: 1, pointerType: "touch", clientX: 30, clientY: 45 });
    fireEvent.pointerUp(stage, { pointerId: 1, pointerType: "touch", clientX: 30, clientY: 45 });
    fireEvent.mouseLeave(stage);

    expect(container.querySelector(".artifact-box")).toHaveAttribute("data-shown");
  });

  it("a single control: there is no separate scrollbar above the comb any more", () => {
    render(<DropRoll photos={photos} onZoom={() => {}} />);

    expect(screen.queryByRole("scrollbar")).not.toBeInTheDocument();
  });

  it("the comb marks the current frame — it also says where we are in the drop", () => {
    render(<DropRoll photos={photos} startAt="/api/film-media/1/2/web" onZoom={() => {}} />);

    expect(screen.getByRole("button", { name: "перейти к кадру 3" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: "перейти к кадру 1" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("the loupe reports the CURRENT frame upward — that is the one to open full screen", async () => {
    const onZoom = vi.fn();
    render(<DropRoll photos={photos} startAt="/api/film-media/1/1/web" onZoom={onZoom} />);

    await userEvent.click(screen.getByRole("button", { name: "открыть кадр 2 во весь экран" }));

    expect(onZoom).toHaveBeenCalledWith(1, expect.anything());
  });
});

describe("DropRoll — the full frame and its stand-in", () => {
  /* A half-downloaded JPEG paints top-down over the thumbnail, and the seam reads as a bad shot. */
  it("the full frame stays unshown until it has loaded whole, the thumbnail stands in meanwhile", () => {
    const { container } = render(<DropRoll photos={photos} onZoom={() => {}} />);
    const full = container.querySelector(".drop-roll__photo") as HTMLImageElement;

    expect(full).not.toHaveAttribute("data-ready");
    expect(container.querySelector(".drop-roll__thumb")).toBeInTheDocument();

    fireEvent.load(full);

    expect(container.querySelector(".drop-roll__photo")).toHaveAttribute("data-ready");
    expect(container.querySelector(".drop-roll__thumb")).not.toBeInTheDocument();
  });

  /* An old drop has no dimensions: the stage hugs the picture, and with the frame unshown it was 0×0. */
  it("a frame without dimensions takes the stage's proportion from its thumbnail", () => {
    const bare: FilmPhotoView[] = [{ imageUrl: "/w", thumbUrl: "/t", width: null, height: null, artifacts: [] }];
    const { container } = render(<DropRoll photos={bare} onZoom={() => {}} />);
    const thumb = container.querySelector(".drop-roll__thumb") as HTMLImageElement;
    Object.defineProperty(thumb, "naturalWidth", { value: 400 });
    Object.defineProperty(thumb, "naturalHeight", { value: 600 });

    fireEvent.load(thumb);

    expect((container.querySelector(".drop-roll__stage") as HTMLElement).style.aspectRatio).toBe("400 / 600");
  });

  it("the finds wait for the full frame: over the blurred stand-in they would read as patches", () => {
    const { container } = render(<DropRoll photos={photos} startAt="/api/film-media/1/2/web" onZoom={() => {}} />);
    expect(container.querySelector(".artifact-box")).toBeNull();

    fireEvent.load(container.querySelector(".drop-roll__photo") as HTMLImageElement);

    expect(container.querySelector(".artifact-box")).not.toBeNull();
  });

  it("a frame already complete from the cache is shown without waiting for a load event", () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    const width = vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(1600);
    const { container } = render(<DropRoll photos={photos} onZoom={() => {}} />);
    complete.mockRestore();
    width.mockRestore();

    expect(container.querySelector(".drop-roll__photo")).toHaveAttribute("data-ready");
  });
});

describe("DropRoll — frame out", () => {
  it("reports which frame the film stands on: the board tile returns to it", () => {
    // The tile follows this address so the developing animation (DESIGN §7.5) lands on the frame
    // you exit from. Otherwise a portrait shot returns into a landscape card and stretches.
    const onCurrent = vi.fn();
    render(
      <DropRoll photos={photos} startAt="/api/film-media/1/1/web" onZoom={() => {}} onCurrent={onCurrent} />,
    );

    expect(onCurrent).toHaveBeenCalledWith(photos[1]);
  });

  it("without a listener it works as it did", () => {
    expect(() => render(<DropRoll photos={photos} onZoom={() => {}} />)).not.toThrow();
  });
});
