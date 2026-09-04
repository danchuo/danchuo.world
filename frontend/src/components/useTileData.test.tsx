import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeCache } from "@/lib/api/cache";
import { useTileData } from "./useTileData";

describe("useTileData — stale-while-revalidate и признак «сеть ответила» (DESIGN §7)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("без копии: loading → loaded, settled только после ответа сети", async () => {
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

  it("копия из кэша показывается сразу, но settled=false, пока сеть не ответила; успех даёт свежее", async () => {
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

  it("сбой сети при живой копии: копия остаётся, settled=true — показанное уже не сменится", async () => {
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
});
