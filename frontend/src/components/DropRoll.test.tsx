import { render, screen } from "@testing-library/react";
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
  it("открывается на кадре, по которому кликнули в плитке, а не с начала дропа", () => {
    render(<DropRoll photos={photos} startAt="/api/film-media/1/2/web" onZoom={() => {}} />);

    expect(screen.getByRole("button", { name: "кадр 3" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("кадр 03 / 3")).toBeInTheDocument();
  });

  it("без адреса кадра открывает первый", () => {
    render(<DropRoll photos={photos} onZoom={() => {}} />);

    expect(screen.getByRole("button", { name: "кадр 1" })).toHaveAttribute("aria-current", "true");
  });

  it("показывает находки текущего кадра и их счёт", () => {
    render(<DropRoll photos={photos} startAt="/api/film-media/1/2/web" onZoom={() => {}} />);

    expect(screen.getByText("находок: 1")).toBeInTheDocument();
    expect(screen.getByText("футболка")).toBeInTheDocument();
  });

  it("регулятор один: отдельной полосы прокрутки над гребёнкой больше нет", () => {
    render(<DropRoll photos={photos} onZoom={() => {}} />);

    expect(screen.queryByRole("scrollbar")).not.toBeInTheDocument();
  });

  it("гребёнка помечает текущий кадр — она же и говорит, где мы в дропе", () => {
    render(<DropRoll photos={photos} startAt="/api/film-media/1/2/web" onZoom={() => {}} />);

    expect(screen.getByRole("button", { name: "перейти к кадру 3" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: "перейти к кадру 1" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("лупа отдаёт наверх ТЕКУЩИЙ кадр — его и открывать во весь экран", async () => {
    const onZoom = vi.fn();
    render(<DropRoll photos={photos} startAt="/api/film-media/1/1/web" onZoom={onZoom} />);

    await userEvent.click(screen.getByRole("button", { name: "открыть кадр 2 во весь экран" }));

    expect(onZoom).toHaveBeenCalledWith(1, expect.anything());
  });
});

describe("DropRoll — кадр наружу", () => {
  it("сообщает, на каком кадре стоит плёнка: плитке борда возвращаться в него", () => {
    // Плитка идёт за этим адресом, чтобы проявка (DESIGN §7.5) садилась в кадр, из которого
    // выходишь. Иначе вертикальный снимок возвращается в горизонтальную карточку и тянется.
    const onCurrent = vi.fn();
    render(
      <DropRoll photos={photos} startAt="/api/film-media/1/1/web" onZoom={() => {}} onCurrent={onCurrent} />,
    );

    expect(onCurrent).toHaveBeenCalledWith(photos[1]);
  });

  it("без слушателя работает как работал", () => {
    expect(() => render(<DropRoll photos={photos} onZoom={() => {}} />)).not.toThrow();
  });
});
