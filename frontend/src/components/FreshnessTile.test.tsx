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
  it("рендерит «N назад» от последнего приёма", async () => {
    getFreshnessMock.mockResolvedValue({ lastIngestAt: hoursAgo(3) });
    render(<FreshnessTile />);
    expect(await screen.findByTestId("freshness-ago")).toHaveTextContent("3 ч назад");
  });

  it("вместо подписи «свежесть» — дозвон с той же ролью для скринридера", async () => {
    getFreshnessMock.mockResolvedValue({ lastIngestAt: hoursAgo(3) });
    render(<FreshnessTile />);
    expect(await screen.findByRole("img", { name: "свежесть" })).toBeInTheDocument();
    expect(screen.queryByText("свежесть")).not.toBeInTheDocument();
    // The tooltip explains the metric rather than repeating the label word.
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "время, когда последний раз обновлялись данные",
    );
  });

  it("дозвон — это ярлык плитки: остаётся и когда приёмов не было", async () => {
    getFreshnessMock.mockResolvedValue({ lastIngestAt: null } satisfies FreshnessView);
    render(<FreshnessTile />);
    await screen.findByText("нет приёмов");
    expect(screen.getByRole("img", { name: "свежесть" })).toBeInTheDocument();
  });

  it("нет приёмов (null) → тихое пустое состояние", async () => {
    getFreshnessMock.mockResolvedValue({ lastIngestAt: null } satisfies FreshnessView);
    render(<FreshnessTile />);
    expect(await screen.findByText("нет приёмов")).toBeInTheDocument();
  });

  it("сбой → состояние ошибки", async () => {
    getFreshnessMock.mockRejectedValue(new Error("boom"));
    render(<FreshnessTile />);
    await waitFor(() => expect(screen.getByText("не удалось загрузить")).toBeInTheDocument());
  });
});
