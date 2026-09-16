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

  it("подписи фаз — те же, что в «Здоровье»: REM / DEEP / CORE", () => {
    // A reader has nothing to compare phases against but Apple's app, and there is no "light"
    // there: the longest phase is called Core. The key stays `light` (HealthKit's `asleepCore`),
    // while the board's label is CORE.
    const p = sleepPhases({ rem: 90, deep: 60, light: 150, awake: 10 });
    expect(p!.map((x) => x.label)).toEqual(["REM", "DEEP", "CORE"]);
  });

  it("нет фаз (null) или пусто ⇒ null (деградация до одной длительности)", () => {
    expect(sleepPhases(null)).toBeNull();
    expect(sleepPhases(undefined)).toBeNull();
    expect(sleepPhases({ rem: 0, deep: 0, light: 0, awake: 30 })).toBeNull();
  });
});

describe("sleepPhases — у каждой фазы своя подсказка", () => {
  const stages = { rem: 90, deep: 60, light: 150, awake: 10 };

  it("подсказка есть у всех трёх фаз и у каждой своя", () => {
    // The hint answers "what is this phase anyway" — three identical texts would answer it worse
    // than none at all.
    const hints = sleepPhases(stages)!.map((p) => p.hint);
    expect(hints.every((h) => h.length > 0)).toBe(true);
    expect(new Set(hints).size).toBe(3);
  });

  it("подсказка короткая — на борде это одна мысль, а не абзац", () => {
    for (const p of sleepPhases(stages)!) expect(p.hint.length).toBeLessThanOrEqual(70);
  });

  it("подсказка не повторяет саму подпись — рядом с ней уже стоят минуты и доля", () => {
    for (const p of sleepPhases(stages)!) expect(p.hint).not.toContain(p.label);
  });
});
