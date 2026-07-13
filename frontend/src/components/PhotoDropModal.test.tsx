import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoDropModal } from "./PhotoDropModal";

vi.mock("@/lib/api/client", () => ({ getDrop: vi.fn() }));
import { getDrop } from "@/lib/api/client";
const getDropMock = vi.mocked(getDrop);

afterEach(() => vi.clearAllMocks());

describe("PhotoDropModal — blur-up загрузка", () => {
  it("кадр стоит из размытого thumb, полный проступает по onLoad", async () => {
    getDropMock.mockResolvedValue([
      { imageUrl: "/api/film-media/1/0/web", thumbUrl: "/api/film-media/1/0/thumb", width: 300, height: 400 },
    ]);

    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel="июль 2026" onClose={() => {}} />,
    );

    // Дождаться загрузки кадров.
    await waitFor(() => expect(container.querySelector(".blur-up-full")).not.toBeNull());

    const thumb = container.querySelector<HTMLImageElement>(".blur-up-thumb")!;
    const full = container.querySelector<HTMLImageElement>(".blur-up-full")!;

    // thumb — сразу виден (blur), полный ещё не загружен (скрыт).
    expect(thumb).toHaveAttribute("src", "/api/film-media/1/0/thumb");
    expect(full).toHaveAttribute("src", "/api/film-media/1/0/web");
    expect(full).toHaveAttribute("loading", "lazy");
    expect(full.dataset.loaded).toBe("false");

    // Полный кадр догрузился — проступает поверх.
    fireEvent.load(full);
    expect(full.dataset.loaded).toBe("true");
  });

  it("thumb остаётся непрозрачной подложкой — фон не мелькает в кросс-фейде", async () => {
    // Регрессионный якорь на «розовый проскок»: раньше thumb гасили одновременно с проявлением
    // полного кадра, и на середине перехода сквозь оба полупрозрачных слоя мелькал фон тайла.
    // thumb НЕ должен получать механизм затухания (ни data-атрибута, ни inline opacity:0)
    // ни до, ни после загрузки полного кадра.
    getDropMock.mockResolvedValue([
      { imageUrl: "/api/film-media/1/0/web", thumbUrl: "/api/film-media/1/0/thumb", width: 300, height: 400 },
    ]);
    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel={null} onClose={() => {}} />,
    );
    await waitFor(() => expect(container.querySelector(".blur-up-full")).not.toBeNull());
    const thumb = container.querySelector<HTMLImageElement>(".blur-up-thumb")!;
    const full = container.querySelector<HTMLImageElement>(".blur-up-full")!;

    const notFaded = () => {
      expect(thumb).not.toHaveAttribute("data-hidden");
      expect(thumb.style.opacity === "" || thumb.style.opacity === "1").toBe(true);
    };

    notFaded(); // до загрузки
    fireEvent.load(full);
    notFaded(); // и после — подложка остаётся плотной
  });

  it("пустой дроп → «пока нет кадров»", async () => {
    getDropMock.mockResolvedValue([]);
    render(<PhotoDropModal dropId={2} title="Пусто" monthLabel={null} onClose={() => {}} />);
    expect(await screen.findByText("в этом дропе пока нет кадров")).toBeInTheDocument();
  });
});
