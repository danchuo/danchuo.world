import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FreshnessView } from "@/lib/api/types";
import { FreshnessTile } from "./FreshnessTile";

vi.mock("@/lib/api/client", () => ({ getFreshness: vi.fn() }));
import { getFreshness } from "@/lib/api/client";
const getFreshnessMock = vi.mocked(getFreshness);

afterEach(() => vi.clearAllMocks());

/** ISO момента «N часов назад» от реального now — чтобы «N назад» не зависело от часов прогона. */
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

describe("FreshnessTile", () => {
  it("рендерит «N назад» от последнего приёма", async () => {
    getFreshnessMock.mockResolvedValue({ lastIngestAt: hoursAgo(3) });
    render(<FreshnessTile />);
    expect(await screen.findByTestId("freshness-ago")).toHaveTextContent("3 ч назад");
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
