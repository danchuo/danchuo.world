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
