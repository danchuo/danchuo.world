import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DayView } from "@/lib/api/types";
import { useSelectedDay } from "./useSelectedDay";

vi.mock("@/lib/api/client", () => ({ getDay: vi.fn() }));

const { getDay } = await import("@/lib/api/client");
const mockGetDay = vi.mocked(getDay);

function dayOf(date: string): DayView {
  return { date, title: null, items: [], workouts: [] } as unknown as DayView;
}

/** Отложенный ответ: тест сам решает, когда день «приедет». */
function deferred() {
  let resolve!: (d: DayView) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<DayView>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useSelectedDay", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockGetDay.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("первый заход без копии — честный лоадер", async () => {
    const first = deferred();
    mockGetDay.mockReturnValue(first.promise);

    const { result } = renderHook(() => useSelectedDay("2026-08-01"));
    expect(result.current.status).toBe("loading");
    expect(result.current.day).toBeNull();

    await act(async () => first.resolve(dayOf("2026-08-01")));
    expect(result.current.status).toBe("loaded");
  });

  /**
   * Главный контракт ветки: на телефоне у плитки «Сегодня» нет высоты от родителя, поэтому
   * состояние loading (оно рисует шиммер ВМЕСТО содержимого) схлопывало её в ноль — экран
   * дёргался на каждом переключении дня. Пока едет новый день, показываем предыдущий.
   */
  it("переключение дня не гасит уже показанный", async () => {
    const first = deferred();
    const second = deferred();
    mockGetDay.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(({ d }) => useSelectedDay(d), {
      initialProps: { d: "2026-08-01" },
    });
    await act(async () => first.resolve(dayOf("2026-08-01")));

    rerender({ d: "2026-08-02" });
    expect(result.current.status).toBe("loaded");
    expect(result.current.day?.date).toBe("2026-08-01");

    await act(async () => second.resolve(dayOf("2026-08-02")));
    expect(result.current.day?.date).toBe("2026-08-02");
  });

  it("ответ на брошенный день не перебивает выбранный", async () => {
    const slow = deferred();
    const fast = deferred();
    mockGetDay.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    const { result, rerender } = renderHook(({ d }) => useSelectedDay(d), {
      initialProps: { d: "2026-08-01" },
    });
    rerender({ d: "2026-08-02" });

    await act(async () => fast.resolve(dayOf("2026-08-02")));
    await act(async () => slow.resolve(dayOf("2026-08-01")));

    expect(result.current.day?.date).toBe("2026-08-02");
  });

  /** Стало́й день на экране не должен молча выдавать себя за выбранный, если сеть отказала. */
  it("отказ на новом дне — ошибка, а не тихий чужой день", async () => {
    const first = deferred();
    const second = deferred();
    mockGetDay.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(({ d }) => useSelectedDay(d), {
      initialProps: { d: "2026-08-01" },
    });
    await act(async () => first.resolve(dayOf("2026-08-01")));

    rerender({ d: "2026-08-02" });
    await act(async () => second.reject(new Error("offline")));
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("возврат на уже загруженный день идёт из памяти, без запроса", async () => {
    const first = deferred();
    const second = deferred();
    mockGetDay.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(({ d }) => useSelectedDay(d), {
      initialProps: { d: "2026-08-01" },
    });
    await act(async () => first.resolve(dayOf("2026-08-01")));
    rerender({ d: "2026-08-02" });
    await act(async () => second.resolve(dayOf("2026-08-02")));

    rerender({ d: "2026-08-01" });
    expect(result.current.day?.date).toBe("2026-08-01");
    expect(result.current.status).toBe("loaded");
    expect(mockGetDay).toHaveBeenCalledTimes(2);
  });
});
