import { describe, expect, it } from "vitest";
import type { DaySummary } from "./api/types";
import { buildRibbon, ribbonDay } from "./waveRibbon";

// Разряды в шагах разделяет НЕРАЗРЫВНЫЙ пробел: так их печатает `formatSteps`
// (`toLocaleString("ru-RU")`), и лента обязана совпадать с цифрами на плитках.

/** Полный день: всё, что лента умеет показать. */
function day(over: Partial<DaySummary> = {}): DaySummary {
  return {
    date: "2026-08-24",
    title: "тихий понедельник",
    hasData: true,
    steps: 8340,
    sleepMinutes: 432,
    contributions: 3,
    monster: null,
    ...over,
  };
}

describe("ribbonDay", () => {
  it("собирает день через точку: дата, имя дня, метрики", () => {
    expect(ribbonDay(day())).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · git +3",
    );
  });

  it("день без имени просто не несёт его — дырки в ленте не остаётся", () => {
    expect(ribbonDay(day({ title: null }))).toBe(
      "пн 24.08 · сон 7ч 12м · шаги 8 340 · git +3",
    );
  });

  it("null ≠ 0: не собранная метрика выпадает, честный ноль остаётся", () => {
    expect(ribbonDay(day({ steps: null, contributions: 0, sleepMinutes: null }))).toBe(
      "пн 24.08 · тихий понедельник · git +0",
    );
  });

  it("дню, которому нечего сказать, в ленте не место — одна голая дата не строка", () => {
    expect(
      ribbonDay(
        day({
          title: null,
          steps: null,
          sleepMinutes: null,
          contributions: null,
          hasData: false,
        }),
      ),
    ).toBeNull();
  });
});

/** Опора «сегодня» для ленты: дни после неё ещё не прожиты. */
const TODAY = "2026-08-26";

describe("buildRibbon", () => {
  it("сшивает дни тем же разделителем, что и поля внутри дня — лента непрерывна", () => {
    const ribbon = buildRibbon(
      [
        day(),
      day({ date: "2026-08-25", title: "день длинных созвонов", steps: 12907, sleepMinutes: 408, contributions: 5 }),
    ], TODAY);
    expect(ribbon).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · git +3 · " +
        "вт 25.08 · день длинных созвонов · сон 6ч 48м · шаги 12 907 · git +5",
    );
  });

  it("пустые дни выпадают, а не оставляют двойные точки", () => {
    const empty = day({
      date: "2026-08-26",
      title: null,
      steps: null,
      sleepMinutes: null,
      contributions: null,
      hasData: false,
    });
    expect(buildRibbon([day(), empty], TODAY)).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · git +3",
    );
  });

  it("окно без единого прожитого дня — пустая лента, а не строка из разделителей", () => {
    expect(buildRibbon([], TODAY)).toBe("");
  });

  it("будущие дни в ленту не попадают — холст про прожитое, а не про календарь", () => {
    const future = day({
      date: "2026-08-27",
      title: null,
      steps: null,
      sleepMinutes: null,
      // Вклады за будущий день приезжают нулём (день собрали, вкладов нет) — без опоры
      // на «сегодня» такой день печатался бы как прожитый: «чт 27.08 · git +0».
      contributions: 0,
    });
    expect(buildRibbon([day(), future], TODAY)).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · git +3",
    );
  });

  it("сегодняшний день — прожитый: он в ленте остаётся", () => {
    const today = day({ date: TODAY, title: "сегодня" });
    expect(buildRibbon([today], TODAY)).toContain("ср 26.08 · сегодня");
  });
});
