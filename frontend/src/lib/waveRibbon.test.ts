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
    disciplineDone: 4,
    disciplineTotal: 7,
    monster: null,
    ...over,
  };
}

describe("ribbonDay", () => {
  it("собирает день через точку: дата, имя дня, метрики", () => {
    expect(ribbonDay(day())).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · вклады +3 · 4/7",
    );
  });

  it("день без имени просто не несёт его — дырки в ленте не остаётся", () => {
    expect(ribbonDay(day({ title: null }))).toBe(
      "пн 24.08 · сон 7ч 12м · шаги 8 340 · вклады +3 · 4/7",
    );
  });

  it("null ≠ 0: не собранная метрика выпадает, честный ноль остаётся", () => {
    expect(ribbonDay(day({ steps: null, contributions: 0, sleepMinutes: null }))).toBe(
      "пн 24.08 · тихий понедельник · вклады +0 · 4/7",
    );
  });

  it("дисциплина без активных пунктов не печатает 0/0", () => {
    expect(ribbonDay(day({ disciplineDone: 0, disciplineTotal: 0 }))).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · вклады +3",
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
          disciplineDone: 0,
          disciplineTotal: 0,
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
      day({ date: "2026-08-25", title: "день длинных созвонов", steps: 12907, sleepMinutes: 408, contributions: 5, disciplineDone: 6 }),
    ], TODAY);
    expect(ribbon).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · вклады +3 · 4/7 · " +
        "вт 25.08 · день длинных созвонов · сон 6ч 48м · шаги 12 907 · вклады +5 · 6/7",
    );
  });

  it("пустые дни выпадают, а не оставляют двойные точки", () => {
    const empty = day({
      date: "2026-08-26",
      title: null,
      steps: null,
      sleepMinutes: null,
      contributions: null,
      disciplineDone: 0,
      disciplineTotal: 0,
      hasData: false,
    });
    expect(buildRibbon([day(), empty], TODAY)).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · вклады +3 · 4/7",
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
      // Вклады за будущий день приезжают нулём (день собрали, вкладов нет), а пунктов
      // дисциплины всегда шесть — без опоры на «сегодня» такой день печатался бы
      // как прожитый: «чт 27.08 · вклады +0 · 0/6».
      contributions: 0,
      disciplineDone: 0,
      disciplineTotal: 6,
    });
    expect(buildRibbon([day(), future], TODAY)).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · вклады +3 · 4/7",
    );
  });

  it("сегодняшний день — прожитый: он в ленте остаётся", () => {
    const today = day({ date: TODAY, title: "сегодня" });
    expect(buildRibbon([today], TODAY)).toContain("ср 26.08 · сегодня");
  });
});
