import { describe, expect, it } from "vitest";
import { BIRTH_DATE, lifeDayNumber, lifeDayLabel } from "./lifeDay";

describe("lifeDayNumber", () => {
  it("день рождения — первый день жизни", () => {
    expect(lifeDayNumber(BIRTH_DATE)).toBe(1);
  });

  it("следующий день — второй", () => {
    expect(lifeDayNumber("2002-06-07")).toBe(2);
  });

  it("считает через високосный год без сдвига", () => {
    // 2004-й високосный: 2002-06-06 → 2004-06-06 = 365 + 366 дней.
    expect(lifeDayNumber("2004-06-06")).toBe(732);
  });

  it("до рождения дня жизни нет", () => {
    expect(lifeDayNumber("2002-06-05")).toBeNull();
  });
});

describe("lifeDayLabel", () => {
  it("подписывает номер дня жизни", () => {
    expect(lifeDayLabel(BIRTH_DATE)).toBe("1-й день жизни");
  });

  it("склоняет порядковое числительное по последней цифре", () => {
    // «8792-й», а не «8792-ой»: у мужского рода единственная форма окончания — «-й».
    expect(lifeDayLabel("2026-08-11")).toBe("8833-й день жизни");
  });

  it("до рождения подписи нет", () => {
    expect(lifeDayLabel("1999-01-01")).toBeNull();
  });
});
