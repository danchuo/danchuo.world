import { describe, expect, it } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { MONSTER_LENS_KEY, lensMatch, lensNote, lensTitle, lensTone, sameLens } from "./disciplineLens";

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
