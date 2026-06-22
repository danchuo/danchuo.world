import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LatestDropTile } from "./LatestDropTile";

vi.mock("@/lib/api/client", () => ({ getDrops: vi.fn(), getDrop: vi.fn() }));
import { getDrop, getDrops } from "@/lib/api/client";
const getDropsMock = vi.mocked(getDrops);
const getDropMock = vi.mocked(getDrop);

afterEach(() => vi.clearAllMocks());

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
});
