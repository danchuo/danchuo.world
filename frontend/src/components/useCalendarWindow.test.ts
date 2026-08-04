import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { datesInRange, weekWindowAround } from "@/lib/date";
import { useCalendarWindow } from "./useCalendarWindow";

vi.mock("@/lib/api/client", () => ({ getDays: vi.fn() }));

const { getDays } = await import("@/lib/api/client");
const mockGetDays = vi.mocked(getDays);

const TODAY = "2026-08-04";

/** Окно вокруг якоря — то, что отдал бы бэк на непорезанный диапазон. */
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

  it("первое окно без копии — честный лоадер", async () => {
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
   * Главный контракт: листание не гасит календарь. Состояние loading рисует шиммер ВМЕСТО
   * сетки, то есть каждый шаг назад схлопывал бы плитку в пустую коробку — ровно та беда,
   * от которой дневной слой уже спасли ([useSelectedDay], DESIGN §7).
   */
  it("шаг назад не гасит уже показанное окно", async () => {
    const first = deferred();
    const second = deferred();
    mockGetDays.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = render(TODAY);
    await act(async () => first.resolve(windowOf(TODAY)));

    rerender({ a: "2026-07-28" });
    expect(result.current.status).toBe("loaded");
    expect(result.current.days).toHaveLength(28);

    // Якорь 28.07 — вторник, понедельник его недели 27.07 ⇒ окно начинается 13.07.
    await act(async () => second.resolve(windowOf("2026-07-28")));
    expect(result.current.days[0].date).toBe("2026-07-13");
  });

  /**
   * Опора едет ВМЕСТЕ с данными, а не раньше: подпись месяца и приглушение чужого месяца
   * считаются от неё, и уехавшая вперёд опора описывала бы окно, которого на экране ещё нет.
   */
  it("опора меняется только когда приехало её окно", async () => {
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

  it("ответ на бро́шенное окно не перебивает текущее", async () => {
    const slow = deferred();
    const fast = deferred();
    mockGetDays.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    const { result, rerender } = render(TODAY);
    rerender({ a: "2026-07-21" });

    await act(async () => fast.resolve(windowOf("2026-07-21")));
    await act(async () => slow.resolve(windowOf(TODAY)));

    expect(result.current.shownAnchor).toBe("2026-07-21");
    // Якорь 21.07 — вторник, понедельник 20.07 ⇒ окно начинается 06.07.
    expect(result.current.days[0].date).toBe("2026-07-06");
  });

  it("отказ сети — честная ошибка, а не тихое чужое окно", async () => {
    const first = deferred();
    const second = deferred();
    mockGetDays.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = render(TODAY);
    await act(async () => first.resolve(windowOf(TODAY)));

    rerender({ a: "2026-07-28" });
    await act(async () => second.reject(new Error("offline")));
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("возврат на уже открытое окно идёт из памяти, без запроса", async () => {
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

  it("окно, обрезанное генезисом, дальше назад не листается", async () => {
    // Бэк клампит `from` к генезису: первый день пришёл позже запрошенного ⇒ раньше нечего.
    const first = deferred();
    mockGetDays.mockReturnValue(first.promise);

    const { result } = render(TODAY);
    await act(async () => first.resolve(windowOf(TODAY).slice(9)));
    expect(result.current.canGoBack).toBe(false);
  });

  it("целое окно историю не исчерпало", async () => {
    const first = deferred();
    mockGetDays.mockReturnValue(first.promise);

    const { result } = render(TODAY);
    await act(async () => first.resolve(windowOf(TODAY)));
    expect(result.current.canGoBack).toBe(true);
  });
});
