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

describe("PhotoDropModal — подсветка артефактов (§5.12)", () => {
  it("рисует рамку долями кадра, а не пикселями", async () => {
    getDropMock.mockResolvedValue([
      {
        imageUrl: "/api/film-media/1/0/web",
        thumbUrl: "/api/film-media/1/0/thumb",
        width: 300,
        height: 400,
        artifacts: [{ artifactId: 7, name: "Ракетка", x0: 0.25, y0: 0.1, x1: 0.75, y1: 0.6 }],
      },
    ]);

    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel="июль 2026" onClose={() => {}} />,
    );

    await waitFor(() => expect(container.querySelector(".artifact-box")).not.toBeNull());
    const box = container.querySelector<HTMLElement>(".artifact-box")!;

    // Доли переживают любой размер рендера — множитель задаёт вёрстка, а не бэкенд.
    // Рамка шире находки на запас 15% с каждой стороны: 0.25..0.75 ⇒ 0.175..0.825.
    expect(box.style.left).toBe("17.5%");
    expect(box.style.top).toBe("2.5%");
    expect(box.style.width).toBe("65%");
    expect(box.style.height).toBe("65%");
  });

  it("подпись артефакта доступна с клавиатуры и скринридеру", async () => {
    getDropMock.mockResolvedValue([
      {
        imageUrl: "/api/film-media/1/0/web",
        thumbUrl: "/api/film-media/1/0/thumb",
        width: 300,
        height: 400,
        artifacts: [{ artifactId: 7, name: "Ракетка", x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 }],
      },
    ]);

    render(<PhotoDropModal dropId={1} title="Плёнка" monthLabel="июль 2026" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Ракетка")).toBeInTheDocument());
  });

  it("кадр без находок не несёт ни одной рамки", async () => {
    getDropMock.mockResolvedValue([
      { imageUrl: "/api/film-media/1/0/web", thumbUrl: "/api/film-media/1/0/thumb", width: 300, height: 400 },
    ]);

    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel="июль 2026" onClose={() => {}} />,
    );

    await waitFor(() => expect(container.querySelector(".blur-up-full")).not.toBeNull());
    expect(container.querySelectorAll(".artifact-box")).toHaveLength(0);
  });
});

describe("PhotoDropModal — подпись артефакта не обрезается", () => {
  it("обёртка кадра не клипует содержимое", async () => {
    // Регрессионный якорь: при overflow:hidden подпись у рамки внизу кадра срезалась краем
    // обёртки. Скругление живёт на самих картинках, обёртка ничего не режет.
    getDropMock.mockResolvedValue([
      {
        imageUrl: "/api/film-media/1/0/web",
        thumbUrl: "/api/film-media/1/0/thumb",
        width: 300,
        height: 400,
        artifacts: [{ artifactId: 7, name: "Ракетка", x0: 0.1, y0: 0.8, x1: 0.5, y1: 0.98 }],
      },
    ]);

    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel="июль 2026" onClose={() => {}} />,
    );

    await waitFor(() => expect(container.querySelector(".artifact-box")).not.toBeNull());
    const frame = container.querySelector<HTMLElement>(".artifact-box")!.parentElement!;
    expect(frame.style.overflow).not.toBe("hidden");
  });
});
