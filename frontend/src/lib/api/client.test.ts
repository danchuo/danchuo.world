import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getDay, getDays } from "./client";
import type { DaySummary, DayView } from "./types";

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  } as Response);
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("getDay бьёт /api/days/{date} и возвращает проекцию", async () => {
    const day: Partial<DayView> = { date: "2026-06-18", hasData: true };
    const spy = mockFetchOnce(day);

    const result = await getDay("2026-06-18");

    expect(result).toEqual(day);
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0][0])).toContain("/api/days/2026-06-18");
  });

  it("getDays кодирует from/to в query", async () => {
    const summaries: DaySummary[] = [];
    const spy = mockFetchOnce(summaries);

    await getDays("2026-06-03", "2026-07-03");

    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain("from=2026-06-03");
    expect(url).toContain("to=2026-07-03");
  });

  it("не-2xx поднимает ApiError со статусом", async () => {
    mockFetchOnce({ error: "before_genesis" }, false, 404);
    await expect(getDay("2025-12-31")).rejects.toBeInstanceOf(ApiError);
    await expect(getDay("2025-12-31")).rejects.toMatchObject({ status: 404 });
  });
});
