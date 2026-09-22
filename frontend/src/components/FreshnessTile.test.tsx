import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FreshnessView } from "@/lib/api/types";
import { FreshnessTile } from "./FreshnessTile";

vi.mock("@/lib/api/client", () => ({ getFreshness: vi.fn() }));
import { getFreshness } from "@/lib/api/client";
const getFreshnessMock = vi.mocked(getFreshness);

afterEach(() => vi.clearAllMocks());

/** The ISO instant "N hours ago" from the real now, so "N ago" does not depend on the run's clock. */
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

describe("FreshnessTile", () => {
  it("renders \"N ago\" from the last ingest", async () => {
    getFreshnessMock.mockResolvedValue({ lastIngestAt: hoursAgo(3) });
    render(<FreshnessTile />);
    expect(await screen.findByTestId("freshness-ago")).toHaveTextContent("3 ч назад");
  });

  it("instead of the \"freshness\" caption — the dial-up with the same role for screen readers", async () => {
    getFreshnessMock.mockResolvedValue({ lastIngestAt: hoursAgo(3) });
    render(<FreshnessTile />);
    expect(await screen.findByRole("img", { name: "свежесть" })).toBeInTheDocument();
    expect(screen.queryByText("свежесть")).not.toBeInTheDocument();
    // The tooltip explains the metric rather than repeating the label word.
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "время, когда последний раз обновлялись данные",
    );
  });

  it("the dial-up is the tile's label: it stays even when there were no ingests", async () => {
    getFreshnessMock.mockResolvedValue({ lastIngestAt: null } satisfies FreshnessView);
    render(<FreshnessTile />);
    await screen.findByText("нет приёмов");
    expect(screen.getByRole("img", { name: "свежесть" })).toBeInTheDocument();
  });

  it("no ingests (null) → a quiet empty state", async () => {
    getFreshnessMock.mockResolvedValue({ lastIngestAt: null } satisfies FreshnessView);
    render(<FreshnessTile />);
    expect(await screen.findByText("нет приёмов")).toBeInTheDocument();
  });

  it("failure → error state", async () => {
    getFreshnessMock.mockRejectedValue(new Error("boom"));
    render(<FreshnessTile />);
    await waitFor(() => expect(screen.getByText("не удалось загрузить")).toBeInTheDocument());
  });
});
