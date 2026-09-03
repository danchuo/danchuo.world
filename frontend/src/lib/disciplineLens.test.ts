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

  it("линза монстра инвертирована: «да» — это чистый день", () => {
    expect(lensMatch(day({ monsterReported: true, monster: null }), MONSTER)).toBe("yes");
    expect(
      lensMatch(
        day({ monsterReported: true, monster: { key: "mango", name: "Mango", accentColor: null } }),
        MONSTER,
      ),
    ).toBe("no");
  });

  it("монстра за день не отмечали — ответа нет, а не «не пил»", () => {
    // Запись дня есть (её создаёт health-ingest), но интерактивный шорткат не запускали.
    expect(lensMatch(day({ hasData: true, monsterReported: false, monster: null }), MONSTER)).toBe(
      "unknown",
    );
    // Старый кэш поля не несёт — молчим так же, а не объявляем день чистым.
    expect(lensMatch(day({ hasData: true, monster: null }), MONSTER)).toBe("unknown");
  });

  it("подпись линзы для ячейки: монстр — тем же вердиктом, что на карте; «нет ответа» молчит", () => {
    expect(lensNote("yes", READING_1)).toBe("чтение: сделано");
    expect(lensNote("no", READING_1)).toBe("чтение: не сделано");
    // Было «без монстра» / «монстр выпит» — третий словарь на тот же факт.
    // Отметки у чистого дня нет, но в ховер-сводке ответ остаётся — там он не шумит.
    expect(lensNote("yes", MONSTER)).toBe("не пил монстр");
    expect(lensNote("no", MONSTER)).toBe("пил монстр");
    expect(lensNote("unknown", MONSTER)).toBeNull();
    expect(lensNote("unknown", READING_1)).toBeNull();
  });

  it("имя линзы в ярлыке — подпись остановки, и у монстра тоже", () => {
    // Разворот «не пил монстр» был костылём под одностороннюю отметку: раз отмечался только
    // чистый день, слово «монстр» не говорило, ЧТО именно отмечено. Теперь отмечены оба
    // ответа и цветом, так что ярлыку остаётся называть предмет линзы, а не её полярность.
    expect(lensTitle(MONSTER)).toBe("монстр");
    expect(lensTitle(READING_1)).toBe("чтение");
  });

  it("тон отметки: у монстра метится ТОЛЬКО «пил», у прочих — только «да»", () => {
    // Для обычного пункта «не совпал» — просто отсутствие: отмечать нечего, день гаснет.
    expect(lensTone("yes", READING_1)).toBe("match");
    expect(lensTone("no", READING_1)).toBeNull();
    expect(lensTone("unknown", READING_1)).toBeNull();

    // У монстра «не совпал» — это СОБЫТИЕ (пил), и именно его ищут глазами по сетке.
    expect(lensTone("no", MONSTER)).toBe("drunk");
    // Чистый день отметки НЕ получает: их подавляющее большинство, и сплошная зелёная
    // сетка превращала отметку в обои — на них терялось единственное красное.
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
