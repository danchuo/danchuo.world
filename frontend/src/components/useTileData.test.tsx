import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeCache } from "@/lib/api/cache";
import { forgetTileAnswers, useTileData } from "./useTileData";

describe("useTileData — stale-while-revalidate and the \"network answered\" flag (DESIGN §7)", () => {
  beforeEach(() => {
    localStorage.clear();
    forgetTileAnswers();
  });
  afterEach(() => localStorage.clear());

  it("without a copy: loading → loaded, settled only after the network answers", async () => {
    let resolve!: (v: string) => void;
    const fetcher = () => new Promise<string>((r) => (resolve = r));
    const { result } = renderHook(() => useTileData(fetcher));
    expect(result.current.phase).toBe("loading");
    expect(result.current.settled).toBe(false);

    await act(async () => resolve("fresh"));
    await waitFor(() => expect(result.current.phase).toBe("loaded"));
    expect(result.current.data).toBe("fresh");
    expect(result.current.settled).toBe(true);
  });

  it("a cached copy shows at once but settled=false until the network answers; success gives the fresh one", async () => {
    writeCache("t", "cached");
    let resolve!: (v: string) => void;
    const fetcher = () => new Promise<string>((r) => (resolve = r));
    const { result } = renderHook(() => useTileData(fetcher, "t"));

    await waitFor(() => expect(result.current.data).toBe("cached"));
    expect(result.current.stale).toBe(true);
    expect(result.current.settled).toBe(false);

    await act(async () => resolve("fresh"));
    await waitFor(() => expect(result.current.data).toBe("fresh"));
    expect(result.current.stale).toBe(false);
    expect(result.current.settled).toBe(true);
  });

  it("a network failure with a live copy: the copy stays, settled=true — what is shown will not change", async () => {
    writeCache("t", "cached");
    let reject!: (e: Error) => void;
    const fetcher = () => new Promise<string>((_, rj) => (reject = rj));
    const { result } = renderHook(() => useTileData(fetcher, "t"));
    await waitFor(() => expect(result.current.data).toBe("cached"));

    await act(async () => reject(new Error("rate_limited")));
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.phase).toBe("loaded");
    expect(result.current.data).toBe("cached");
    expect(result.current.stale).toBe(true);
  });

  it("a key change refetches with a NEW fetcher: the calendar steps through days, the data follows", async () => {
    const asked: string[] = [];
    const render = ({ date }: { date: string }) =>
      useTileData(() => {
        asked.push(date);
        return Promise.resolve(date);
      }, `night:${date}`);
    const { result, rerender } = renderHook(render, { initialProps: { date: "2026-09-10" } });
    await waitFor(() => expect(result.current.data).toBe("2026-09-10"));

    rerender({ date: "2026-09-11" });
    await waitFor(() => expect(result.current.data).toBe("2026-09-11"));
    expect(asked).toEqual(["2026-09-10", "2026-09-11"]);
  });

  it("two tiles on one key share ONE request: a wave that scatters a tile makes no duplicates", async () => {
    let calls = 0;
    let resolve!: (v: string) => void;
    const fetcher = () => {
      calls += 1;
      return new Promise<string>((r) => (resolve = r));
    };
    const a = renderHook(() => useTileData(fetcher, "shared"));
    const b = renderHook(() => useTileData(fetcher, "shared"));
    expect(calls).toBe(1);

    await act(async () => resolve("one"));
    await waitFor(() => expect(b.result.current.data).toBe("one"));
    expect(a.result.current.data).toBe("one");
  });

  it("a remount within the freshness window paints the answer at once and does not ask again", async () => {
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return Promise.resolve("answer");
    };
    const first = renderHook(() => useTileData(fetcher, "remount"));
    await waitFor(() => expect(first.result.current.data).toBe("answer"));
    first.unmount();

    const second = renderHook(() => useTileData(fetcher, "remount"));
    expect(second.result.current.phase).toBe("loaded");
    expect(second.result.current.data).toBe("answer");
    expect(second.result.current.settled).toBe(true);
    expect(calls).toBe(1);
  });

  it("an unmount does not cancel a shared request: the next mount takes its answer", async () => {
    let calls = 0;
    let resolve!: (v: string) => void;
    const fetcher = () => {
      calls += 1;
      return new Promise<string>((r) => (resolve = r));
    };
    renderHook(() => useTileData(fetcher, "handover")).unmount();
    const next = renderHook(() => useTileData(fetcher, "handover"));

    await act(async () => resolve("kept"));
    await waitFor(() => expect(next.result.current.data).toBe("kept"));
    expect(calls).toBe(1);
  });

  it("retry always goes to the network, past a fresh answer", async () => {
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return Promise.resolve(`#${calls}`);
    };
    const { result } = renderHook(() => useTileData(fetcher, "retry"));
    await waitFor(() => expect(result.current.data).toBe("#1"));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.data).toBe("#2"));
  });
});
