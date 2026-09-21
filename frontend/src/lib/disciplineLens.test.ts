import { describe, expect, it } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import {
  MONSTER_LENS_KEY,
  lensMatch,
  lensNote,
  lensRun,
  lensTitle,
  pinLens,
  lensTone,
  sameLens,
} from "./disciplineLens";

function day(over: Partial<DaySummary> = {}): DaySummary {
  return {
    date: "2026-07-20",
    title: null,
    hasData: true,
    steps: null,
    sleepMinutes: null,
    contributions: null,
    disciplineCounts: {},
    monsterDrunk: null,
    ...over,
  };
}

const READING_1 = { key: "reading", occurrence: 1, label: "чтение" };
const READING_2 = { key: "reading", occurrence: 2, label: "чтение" };
const MONSTER = { key: MONSTER_LENS_KEY, occurrence: 1, label: "монстр" };

describe("линза дисциплины", () => {
  it("остановка закрыта порогом count ≥ occurrence — две остановки пункта отвечают по-разному", () => {
    const once = day({ disciplineCounts: { reading: 1 } });
    expect(lensMatch(once, READING_1)).toBe("yes");
    expect(lensMatch(once, READING_2)).toBe("no");

    const twice = day({ disciplineCounts: { reading: 2 } });
    expect(lensMatch(twice, READING_1)).toBe("yes");
    expect(lensMatch(twice, READING_2)).toBe("yes");
  });

  it("пункт в счётчиках нулём (или вовсе отсутствует) — не сделан, но ответ есть", () => {
    expect(lensMatch(day({ disciplineCounts: { reading: 0 } }), READING_1)).toBe("no");
    expect(lensMatch(day({ disciplineCounts: {} }), READING_1)).toBe("no");
  });

  it("день без данных (пустой или будущий) ответа не даёт", () => {
    expect(lensMatch(day({ hasData: false }), READING_1)).toBe("unknown");
    expect(lensMatch(day({ hasData: false }), MONSTER)).toBe("unknown");
  });

  it("старый кэш без поля счётчиков деградирует в «нет ответа», а не в «не сделал»", () => {
    const stale = day();
    delete (stale as Partial<DaySummary>).disciplineCounts;
    expect(lensMatch(stale, READING_1)).toBe("unknown");
  });

  it("линза монстра инвертирована: «да» — это чистый день", () => {
    expect(lensMatch(day({ monsterDrunk: false }), MONSTER)).toBe("yes");
    expect(
      lensMatch(
        day({ monsterDrunk: true }),
        MONSTER,
      ),
    ).toBe("no");
  });

  it("монстра за день не отмечали — ответа нет, а не «не пил»", () => {
    // The day has a record (health ingest creates it) but the interactive shortcut never ran.
    expect(lensMatch(day({ hasData: true, monsterDrunk: null }), MONSTER)).toBe(
      "unknown",
    );
    // An old cache carries no such field — stay silent rather than declare the day clean.
    expect(lensMatch(day({ hasData: true }), MONSTER)).toBe("unknown");
  });

  it("подпись линзы для ячейки: монстр — тем же вердиктом, что на карте; «нет ответа» молчит", () => {
    expect(lensNote("yes", READING_1)).toBe("чтение: сделано");
    expect(lensNote("no", READING_1)).toBe("чтение: не сделано");
    // A clean day gets no mark, but the hover summary still answers — there it is not noise.
    expect(lensNote("yes", MONSTER)).toBe("не пил монстр");
    expect(lensNote("no", MONSTER)).toBe("пил монстр");
    expect(lensNote("unknown", MONSTER)).toBeNull();
    expect(lensNote("unknown", READING_1)).toBeNull();
  });

  it("имя линзы в ярлыке — подпись остановки, и у монстра тоже", () => {
    // Both answers are marked by colour, so the label names the lens's subject rather than its
    // polarity; inverting it was rejected (DESIGN §5.1).
    expect(lensTitle(MONSTER)).toBe("монстр");
    expect(lensTitle(READING_1)).toBe("чтение");
  });

  it("тон отметки: у монстра метится ТОЛЬКО «пил», у прочих — только «да»", () => {
    // For an ordinary item "no match" is simply an absence: nothing to mark, the day dims.
    expect(lensTone("yes", READING_1)).toBe("match");
    expect(lensTone("no", READING_1)).toBeNull();
    expect(lensTone("unknown", READING_1)).toBeNull();

    // For the monster "no match" is an EVENT (drunk), and that is what the eye looks for.
    expect(lensTone("no", MONSTER)).toBe("drunk");
    // A clean day gets NO mark: they are the vast majority, and a solid green grid turned the mark
    // into wallpaper that the single red one was lost in.
    expect(lensTone("yes", MONSTER)).toBeNull();
    expect(lensTone("unknown", MONSTER)).toBeNull();
  });

  it("тоггл сравнивает остановку целиком (ключ + occurrence)", () => {
    expect(sameLens(READING_1, { ...READING_1 })).toBe(true);
    expect(sameLens(READING_1, READING_2)).toBe(false);
    expect(sameLens(null, null)).toBe(true);
    expect(sameLens(READING_1, null)).toBe(false);
  });
});

describe("закрепление линзы", () => {
  it("повторно названная линза снимается, другая — заменяет", () => {
    expect(pinLens(READING_1, READING_1)).toBeNull();
    expect(pinLens(READING_1, READING_2)).toEqual(READING_2);
    expect(pinLens(null, READING_1)).toEqual(READING_1);
  });

  it("явный null снимает любую закреплённую линзу — это крестик ярлыка", () => {
    expect(pinLens(READING_1, null)).toBeNull();
    expect(pinLens(null, null)).toBeNull();
  });
});

/**
 * The live run behind the lens (DESIGN §5.2). Its terms are the BACKEND's own (`StreakCalculator`):
 * a weekend is stepped over, an unfilled today does not drop the run — otherwise the light in the
 * calendar and the numeral in the sheet's socket would answer the same question differently.
 */
describe("живая серия линзы", () => {
  // Mon 2026-07-13 … Sun 2026-07-19, then Mon 2026-07-20.
  function week(counts: Array<number | null>): DaySummary[] {
    return counts.map((c, i) => {
      const iso = `2026-07-${String(13 + i).padStart(2, "0")}`;
      return c === null
        ? day({ date: iso, hasData: false, disciplineCounts: undefined })
        : day({ date: iso, disciplineCounts: { reading: c } });
    });
  }

  it("серия — подряд идущие сделанные дни, считая назад от сегодня", () => {
    const run = lensRun(week([0, 1, 1, 1, 1, 0, 0, 1]), READING_1, "2026-07-16");

    expect(run.length).toBe(3);
    expect([...run.marks.keys()].sort()).toEqual(["2026-07-14", "2026-07-15", "2026-07-16"]);
    expect(run.truncated).toBe(false);
  });

  it("выходной перешагивается: серию не рвёт, но и не считается — и светит вполсилы", () => {
    // Sat 18 and Sun 19 are empty, and the run crosses them from Friday to Monday.
    const run = lensRun(week([0, 0, 1, 1, 1, 0, 0, 1]), READING_1, "2026-07-20");

    expect(run.length).toBe(4);
    expect(run.marks.get("2026-07-18")).toBe("step");
    expect(run.marks.get("2026-07-19")).toBe("step");
    expect(run.marks.get("2026-07-20")).toBe("on");
  });

  it("незакрытое сегодня серию не роняет, но светом не притворяется", () => {
    const run = lensRun(week([0, 1, 1, 0, 0, 0, 0, 0]), READING_1, "2026-07-16");

    expect(run.length).toBe(2);
    expect(run.marks.get("2026-07-16")).toBe("step");
    expect(run.marks.get("2026-07-15")).toBe("on");
  });

  it("день без ответа серию рвёт — молчание не засчитывается за сделанное", () => {
    const run = lensRun(week([1, 1, null, 1, 1, 0, 0, 0]), READING_1, "2026-07-17");

    expect(run.length).toBe(2);
    expect(run.marks.has("2026-07-15")).toBe(false);
  });

  it("серия, упёршаяся в край окна, честно помечена обрезанной", () => {
    const run = lensRun(week([1, 1, 1, 1, 1, 0, 0, 0]), READING_1, "2026-07-17");

    expect(run.length).toBe(5);
    expect(run.truncated).toBe(true);
  });

  it("у монстра серии нет вовсе: подсветить чистые дни значило бы залить сетку целиком", () => {
    const days = week([0, 0, 0, 0, 0, 0, 0, 0]).map((d) => ({ ...d, monsterDrunk: false }));

    expect(lensRun(days, MONSTER, "2026-07-20").length).toBe(0);
    expect(lensRun(days, MONSTER, "2026-07-20").marks.size).toBe(0);
  });

  it("оборванная серия не оставляет зажжённым перешагнутый хвост", () => {
    // Today is an unfilled Monday and Friday was missed too, so there is nothing to light.
    const run = lensRun(week([1, 1, 1, 1, 0, 0, 0, 0]), READING_1, "2026-07-20");

    expect(run.length).toBe(0);
    expect(run.marks.size).toBe(0);
  });
});
