import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeatmapSection } from "./HeatmapSection";
import { gridArea, resolveLayout, type TileId } from "@/lib/layout";

vi.mock("@/lib/api/admin", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/admin")>()),
  getHeatmap: vi.fn(),
}));
import { getHeatmap } from "@/lib/api/admin";
const getHeatmapMock = vi.mocked(getHeatmap);

afterEach(() => vi.clearAllMocks());

const view = {
  path: "/",
  from: "2026-09-15",
  to: "2026-09-21",
  grid: 6,
  totalClicks: 12,
  tiles: [
    { tileId: "today", clicks: 9, uniques: 3, cells: [{ x: 1, y: 2, clicks: 7 }, { x: 5, y: 5, clicks: 2 }] },
    { tileId: null, clicks: 3, uniques: 1, cells: [] },
  ],
};

describe("HeatmapSection", () => {
  it("каждая плитка встаёт на своё место борда, а не в одну клетку", async () => {
    // The overlay is only readable as the board; without gridArea every tile collapses into
    // a single grid cell and the bento turns into a strip.
    getHeatmapMock.mockResolvedValue(view);
    const { container } = render(<HeatmapSection token="t" from={view.from} to={view.to} />);
    await waitFor(() => expect(getHeatmapMock).toHaveBeenCalled());

    const layout = resolveLayout(null);
    const cells = [...container.querySelectorAll<HTMLElement>("[title]")].filter((el) =>
      el.style.gridArea !== "",
    );
    expect(cells.length).toBeGreaterThan(1);

    const today = cells.find((el) => el.getAttribute("title")?.startsWith("today:"));
    expect(today?.style.gridArea.replace(/\s/g, "")).toBe(
      gridArea(layout.tiles["today" as TileId]).replace(/\s/g, ""),
    );
    // Two different tiles must not share one area, which is what the collapse looked like.
    expect(new Set(cells.map((el) => el.style.gridArea)).size).toBeGreaterThan(1);
  });

  it("облачко кликов рисуется бинами внутри плитки", async () => {
    getHeatmapMock.mockResolvedValue(view);
    const { container } = render(<HeatmapSection token="t" from={view.from} to={view.to} />);
    await waitFor(() => expect(container.querySelector("[aria-hidden]")).not.toBeNull());

    const cloud = container.querySelector<HTMLElement>("[aria-hidden]");
    expect(cloud?.children).toHaveLength(2);
    expect((cloud?.firstElementChild as HTMLElement).style.gridColumn).toBe("2");
    expect((cloud?.firstElementChild as HTMLElement).style.gridRow).toBe("3");
  });
});
