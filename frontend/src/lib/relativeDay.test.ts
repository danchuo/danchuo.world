import { describe, expect, it } from "vitest";
import { pluralDays, relativeDayRu } from "./relativeDay";

// The reference "today" is Thursday 2026-06-18 (the MSK canon), fixed for determinism.
const TODAY = "2026-06-18";

describe("relativeDayRu", () => {
  it("точные термины (±2 дня) приоритетнее всего", () => {
    expect(relativeDayRu("2026-06-18", TODAY)).toBe("сегодня");
    expect(relativeDayRu("2026-06-17", TODAY)).toBe("вчера");
    expect(relativeDayRu("2026-06-16", TODAY)).toBe("позавчера");
    expect(relativeDayRu("2026-06-19", TODAY)).toBe("завтра");
    expect(relativeDayRu("2026-06-20", TODAY)).toBe("послезавтра");
  });

  it("та же календарная неделя — день недели без префикса", () => {
    // today is Thu 18.06; the week runs Mon 15.06 to Sun 21.06.
    expect(relativeDayRu("2026-06-15", TODAY)).toBe("в понедельник"); // bare, not "last"
    expect(relativeDayRu("2026-06-21", TODAY)).toBe("в воскресенье"); // bare, not "next"
  });

  it("соседняя неделя — «в прошлый/следующий <день>», согласовано по роду", () => {
    // last week runs Mon 08.06 to Sun 14.06.
    expect(relativeDayRu("2026-06-08", TODAY)).toBe("в прошлый понедельник");
    expect(relativeDayRu("2026-06-13", TODAY)).toBe("в прошлую субботу");
    // next week runs Mon 22.06 to Sun 28.06.
    expect(relativeDayRu("2026-06-22", TODAY)).toBe("в следующий понедельник");
    expect(relativeDayRu("2026-06-28", TODAY)).toBe("в следующее воскресенье");
  });

  it("дальше соседней недели — числом с правильным склонением", () => {
    expect(relativeDayRu("2026-06-05", TODAY)).toBe("13 дней назад"); // two weeks back
    expect(relativeDayRu("2026-06-30", TODAY)).toBe("через 12 дней"); // two weeks ahead
    expect(relativeDayRu("2026-05-28", TODAY)).toBe("21 день назад");
    expect(relativeDayRu("2026-05-27", TODAY)).toBe("22 дня назад");
  });
});

describe("pluralDays", () => {
  it("ветви склонения день/дня/дней", () => {
    expect(pluralDays(1)).toBe("день");
    expect(pluralDays(2)).toBe("дня");
    expect(pluralDays(5)).toBe("дней");
    expect(pluralDays(11)).toBe("дней"); // the 11–14 special case
    expect(pluralDays(21)).toBe("день");
    expect(pluralDays(22)).toBe("дня");
    expect(pluralDays(114)).toBe("дней");
  });
});
