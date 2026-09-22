import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { datesInRange, weekWindowAround } from "@/lib/date";
import { useCalendarWindow } from "./useCalendarWindow";

vi.mock("@/lib/api/client", () => ({ getDays: vi.fn() }));

const { getDays } = await import("@/lib/api/client");
const mockGetDays = vi.mocked(getDays);

const TODAY = "2026-08-04";

/** The window around an anchor — what the backend would serve for an untrimmed range. */
function windowOf(anchor: string): DaySummary[] {
  const { from, to } = weekWindowAround(anchor, 2, 1);
  return datesInRange(from, to).map((date) => ({ date }) as DaySummary);
}

function deferred() {
  let resolve!: (d: DaySummary[]) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<DaySummary[]>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const render = (anchor: string) =>
  renderHook(({ a }) => useCalendarWindow(a, 2, 1), { initialProps: { a: anchor } });

describe("useCalendarWindow", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockGetDays.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("the first window without a copy — an honest loader", async () => {
    const first = deferred();
    mockGetDays.mockReturnValue(first.promise);

    const { result } = render(TODAY);
    expect(result.current.status).toBe("loading");
    expect(result.current.days).toHaveLength(0);

    await act(async () => first.resolve(windowOf(TODAY)));
    expect(result.current.status).toBe("loaded");
    expect(result.current.days).toHaveLength(28);
  });

  /**
   * The main contract: paging does not blank the calendar. The loading state draws a shimmer
   * INSTEAD of the grid, so every step back would collapse the tile into an empty box — the same
   * trouble the day layer was already saved from ([useSelectedDay], DESIGN §7).
   */
  it("a step back does not blank the window already shown", async () => {
    const first = deferred();
    const second = deferred();
    mockGetDays.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = render(TODAY);
    await act(async () => first.resolve(windowOf(TODAY)));

    rerender({ a: "2026-07-28" });
    expect(result.current.status).toBe("loaded");
    expect(result.current.days).toHaveLength(28);

    // Anchor 28.07 is a Tuesday, its week's Monday is 27.07 ⇒ the window starts on 13.07.
    await act(async () => second.resolve(windowOf("2026-07-28")));
    expect(result.current.days[0].date).toBe("2026-07-13");
  });

  /**
   * The reference moves WITH the data, not ahead of it: the month caption and the dimming of a
   * foreign month are computed from it, and a reference that ran ahead would describe a window
   * not yet on screen.
   */
  it("the anchor changes only once its window has arrived", async () => {
    const first = deferred();
    const second = deferred();
    mockGetDays.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = render(TODAY);
    await act(async () => first.resolve(windowOf(TODAY)));

    rerender({ a: "2026-06-30" });
    expect(result.current.shownAnchor).toBe(TODAY);

    await act(async () => second.resolve(windowOf("2026-06-30")));
    expect(result.current.shownAnchor).toBe("2026-06-30");
  });

  it("an answer for an abandoned window does not override the current one", async () => {
    const slow = deferred();
    const fast = deferred();
    mockGetDays.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    const { result, rerender } = render(TODAY);
    rerender({ a: "2026-07-21" });

    await act(async () => fast.resolve(windowOf("2026-07-21")));
    await act(async () => slow.resolve(windowOf(TODAY)));

    expect(result.current.shownAnchor).toBe("2026-07-21");
    // Anchor 21.07 is a Tuesday, Monday is 20.07 ⇒ the window starts on 06.07.
    expect(result.current.days[0].date).toBe("2026-07-06");
  });

  it("a network failure is an honest error, not a quiet stale window", async () => {
    const first = deferred();
    const second = deferred();
    mockGetDays.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = render(TODAY);
    await act(async () => first.resolve(windowOf(TODAY)));

    rerender({ a: "2026-07-28" });
    await act(async () => second.reject(new Error("offline")));
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("returning to an already open window comes from memory, without a request", async () => {
    const first = deferred();
    const second = deferred();
    mockGetDays.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = render(TODAY);
    await act(async () => first.resolve(windowOf(TODAY)));
    rerender({ a: "2026-07-28" });
    await act(async () => second.resolve(windowOf("2026-07-28")));

    rerender({ a: TODAY });
    expect(result.current.shownAnchor).toBe(TODAY);
    expect(result.current.status).toBe("loaded");
    expect(mockGetDays).toHaveBeenCalledTimes(2);
  });

  it("a window cut by genesis does not page further back", async () => {
    // The backend clamps `from` to genesis: the first day arrived later than requested ⇒ there is
    // nothing earlier.
    const first = deferred();
    mockGetDays.mockReturnValue(first.promise);

    const { result } = render(TODAY);
    await act(async () => first.resolve(windowOf(TODAY).slice(9)));
    expect(result.current.canGoBack).toBe(false);
  });

  it("a full window has not exhausted the history", async () => {
    const first = deferred();
    mockGetDays.mockReturnValue(first.promise);

    const { result } = render(TODAY);
    await act(async () => first.resolve(windowOf(TODAY)));
    expect(result.current.canGoBack).toBe(true);
  });
});
