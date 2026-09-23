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
    render(<DropRoll photos={photos} startAt="/api/film-media/1/2/web" onZoom={() => {}} />);

    expect(screen.getByText("находок: 1")).toBeInTheDocument();
    expect(screen.getByText("футболка")).toBeInTheDocument();
  });

  /* A phone has no hover: a tap is the finger's "hand on the find", and a tap beside it lets go. */
  it("a touch tap on a find takes it into focus, a tap past every find releases it", () => {
    const { container } = render(<DropRoll photos={photos} startAt="/api/film-media/1/2/web" onZoom={() => {}} />);
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
