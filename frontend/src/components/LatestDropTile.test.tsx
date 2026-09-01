import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LatestDropTile } from "./LatestDropTile";
import { buildMosaic } from "@/lib/mosaic";
import type { FilmPhotoView } from "@/lib/api/types";

vi.mock("@/lib/api/client", () => ({ getDrops: vi.fn(), getDrop: vi.fn() }));
import { getDrop, getDrops } from "@/lib/api/client";
const getDropsMock = vi.mocked(getDrops);
const getDropMock = vi.mocked(getDrop);

afterEach(() => vi.clearAllMocks());

const landscape = (seq: number): FilmPhotoView => ({
  imageUrl: `/api/film-media/1/${seq}/web`,
  thumbUrl: `/api/film-media/1/${seq}/thumb`,
  width: 120,
  height: 80,
});

describe("buildMosaic (justified-раскладка кадров)", () => {
  it("пять кадров никогда не пакуются в один ряд, даже в широком низком виджете", () => {
    const photos = [0, 1, 2, 3, 4].map(landscape);
    // Широкий и низкий контейнер: без капа единственный ряд из 5 выигрывал по score.
    const mosaic = buildMosaic(photos, 1000, 120);
    expect(mosaic).not.toBeNull();
    for (const row of mosaic!) expect(row.length).toBeLessThanOrEqual(4);
    // Перераскладка, не выбрасывание: все 5 кадров остаются на месте.
    expect(mosaic!.flat()).toHaveLength(5);
  });

  it("четыре кадра в один ряд — по-прежнему можно", () => {
    const photos = [0, 1, 2, 3].map(landscape);
    const mosaic = buildMosaic(photos, 1000, 120);
    expect(mosaic).not.toBeNull();
    expect(mosaic!).toHaveLength(1);
    expect(mosaic![0]).toHaveLength(4);
  });
});

describe("LatestDropTile (крупный последний дроп)", () => {
  it("нет дропов → пустое состояние, кадры не запрашиваются", async () => {
    getDropsMock.mockResolvedValue([]);
    render(<LatestDropTile />);
    expect(await screen.findByText("пока нет дропов")).toBeInTheDocument();
    expect(getDropMock).not.toHaveBeenCalled();
  });

  it("есть дропы → крупно показывает последний (его название и кадры)", async () => {
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
      { id: 1, title: "Июньская плёнка", droppedOn: "2026-06-10", monthLabel: "июнь 2026", photoCount: 36, coverPhotoUrl: "/api/film-media/1/0/thumb" },
    ]);
    getDropMock.mockResolvedValue([
      { imageUrl: "/api/film-media/2/0/web", thumbUrl: "/api/film-media/2/0/thumb", width: 120, height: 80 },
    ]);

    render(<LatestDropTile />);

    expect(await screen.findByText("Июльская плёнка")).toBeInTheDocument();
    // Тянет кадры только последнего дропа (id=2).
    expect(getDropMock).toHaveBeenCalledWith(2, expect.anything());
  });

  it("ширину кадров раздаёт флексбокс, а не пиксели из JS", () => {
    // Пиксельная ширина в `style.width` держалась на том, что движок сложит числа так же,
    // как их сложил расчёт. Safari складывал иначе, и правый кадр вылезал за карточку.
    // `flex-grow` + `flex-basis: 0` заставляют ряд заполнить контейнер по определению.
    const photos = [0, 1, 2, 3].map(landscape);
    const mosaic = buildMosaic(photos, 341, 260)!;
    expect(mosaic.flat().length).toBe(4);
    // Сам контракт разметки проверяется рендером ниже — здесь фиксируем, что расчёт
    // по-прежнему отдаёт целые ширины, из которых берутся grow-коэффициенты.
    for (const cell of mosaic.flat()) expect(Number.isInteger(cell.w)).toBe(true);
  });

  it("ширина карточки НЕ анимируется — иначе WebKit размазывает её тень по боковым зазорам", async () => {
    // Плитка несёт filter: drop-shadow, то есть свой композитный слой; тень волны 01 смещена
    // вправо-вниз и выходит за бокс. WebKit не подчищает область, освобождённую сжимающимся
    // слоем, и каждый кадр перегона ширины оставлял полосу тени — в Safari справа от карточки
    // вырастала гребёнка из десятка полос (docs/pitfalls.md).
    //
    // Геометрию подставляем руками: без неё `frameW` нулевой, карточка идёт по ветке «ширина
    // не задана», и замок сторожил бы ветку, в которой анимации не бывает и так.
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => "" } as DOMRect);
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
    ]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1), landscape(2)]);

    const { container } = render(<LatestDropTile />);
    await screen.findByText("Июльская плёнка");

    const card = container.querySelector(".pixel-tile") as HTMLElement;
    // Ширина действительно посчиталась ⇒ замок стоит на той самой ветке.
    expect(card.style.width).not.toBe("");
    expect(card.style.transition).toBe("");
    rect.mockRestore();
  });

  it("блок мозаики зацеплен за .drop-mosaic — свою высоту ему даёт CSS", async () => {
    // Высота блока — вход расчёта рядов (`buildMosaic` при H<=0 возвращает null), а в мобильном
    // стеке родитель её не задаёт: без собственной высоты плитка оставалась без кадров навсегда
    // (пустой блок мерился нулём, ноль не давал кадров). Пиксели проверяет CSS-контракт
    // `app/styles/stackHeights.test.ts`, здесь — что зацепка на месте.
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
    ]);
    getDropMock.mockResolvedValue([
      { imageUrl: "/api/film-media/2/0/web", thumbUrl: "/api/film-media/2/0/thumb", width: 120, height: 80 },
    ]);

    render(<LatestDropTile />);

    const box = await screen.findByRole("button", { name: /Открыть дроп/ });
    expect(box).toHaveClass("drop-mosaic");
  });
});

describe("LatestDropTile — ряд мозаики заполняет контейнер сам", () => {
  it("у кадров flex-grow и нулевой базис, а жёсткой ширины в пикселях нет", async () => {
    // Регрессионный замок на несущее решение: горизонталь не должна зависеть от того,
    // как движок сложит записанные из JS пиксели. Вернётся `width: Npx` — вернётся и
    // обрезка правого кадра в Safari.
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => "" } as DOMRect);
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
    ]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1), landscape(2), landscape(3)]);

    const { container } = render(<LatestDropTile />);
    await screen.findByText("Июльская плёнка");

    const imgs = [...container.querySelectorAll(".drop-mosaic img")] as HTMLImageElement[];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img.style.flexGrow).not.toBe("");
      expect(img.style.flexBasis).toBe("0px");
      expect(img.style.width).toBe("");
      expect(img.style.aspectRatio).not.toBe("");
    }
    // Ряд тянется во всю ширину контейнера, а не по сумме пикселей.
    const row = container.querySelector(".drop-mosaic > div") as HTMLElement;
    expect(row.style.width).toBe("100%");
    rect.mockRestore();
  });
});
