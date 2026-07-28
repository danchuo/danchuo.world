import { describe, expect, it } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { MONSTER_LENS_KEY, lensMatch, lensNote, lensTitle, sameLens } from "./disciplineLens";

function day(over: Partial<DaySummary> = {}): DaySummary {
  return {
    date: "2026-07-20",
    title: null,
    hasData: true,
    steps: null,
    sleepMinutes: null,
    disciplineDone: 0,
    disciplineTotal: 5,
    disciplineCounts: {},
    monster: null,
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

  it("линза монстра инвертирована: отмечаются ЧИСТЫЕ дни", () => {
    expect(lensMatch(day({ monster: null }), MONSTER)).toBe("yes");
    expect(
      lensMatch(day({ monster: { key: "mango", name: "Mango", accentColor: null } }), MONSTER),
    ).toBe("no");
  });

  it("подпись линзы для ячейки: полярность монстра — словами, «нет ответа» — молчит", () => {
    expect(lensNote("yes", READING_1)).toBe("чтение: сделано");
    expect(lensNote("no", READING_1)).toBe("чтение: не сделано");
    expect(lensNote("yes", MONSTER)).toBe("без монстра");
    expect(lensNote("no", MONSTER)).toBe("монстр выпит");
    expect(lensNote("unknown", READING_1)).toBeNull();
  });

  it("имя линзы в ярлыке: у монстра развёрнутое, у прочих — подпись остановки", () => {
    expect(lensTitle(MONSTER)).toBe("не пил монстр");
    expect(lensTitle(READING_1)).toBe("чтение");
  });

  it("тоггл сравнивает остановку целиком (ключ + occurrence)", () => {
    expect(sameLens(READING_1, { ...READING_1 })).toBe(true);
    expect(sameLens(READING_1, READING_2)).toBe(false);
    expect(sameLens(null, null)).toBe(true);
    expect(sameLens(READING_1, null)).toBe(false);
  });
});
