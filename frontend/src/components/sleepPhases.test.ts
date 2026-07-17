import { describe, expect, it } from "vitest";
import { sleepPhases } from "./sleepPhases";

describe("sleepPhases (§7.7)", () => {
  it("считает доли от суммы rem+deep+light (awake не входит)", () => {
    const p = sleepPhases({ rem: 92, deep: 68, light: 301, awake: 12 });
    expect(p).not.toBeNull();
    expect(p!.map((x) => [x.key, x.minutes, x.pct])).toEqual([
      ["rem", 92, 20],
      ["deep", 68, 15],
      ["light", 301, 65],
    ]);
  });

  it("отсутствующая фаза считается нулём, а не роняет расчёт", () => {
    const p = sleepPhases({ rem: null, deep: 60, light: 60, awake: null });
    expect(p!.find((x) => x.key === "rem")!.pct).toBe(0);
    expect(p!.find((x) => x.key === "deep")!.pct).toBe(50);
  });

  it("нет фаз (null) или пусто ⇒ null (деградация до одной длительности)", () => {
    expect(sleepPhases(null)).toBeNull();
    expect(sleepPhases(undefined)).toBeNull();
    expect(sleepPhases({ rem: 0, deep: 0, light: 0, awake: 30 })).toBeNull();
  });
});
