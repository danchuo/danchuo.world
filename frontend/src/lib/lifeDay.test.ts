import { describe, expect, it } from "vitest";
import { BIRTH_DATE, lifeDayNumber, lifeDayLabel } from "./lifeDay";

describe("lifeDayNumber", () => {
  it("the birthday is the first day of life", () => {
    expect(lifeDayNumber(BIRTH_DATE)).toBe(1);
  });

  it("the next day is the second", () => {
    expect(lifeDayNumber("2002-06-07")).toBe(2);
  });

  it("counts across a leap year without a shift", () => {
    // 2004 is a leap year: 2002-06-06 → 2004-06-06 = 365 + 366 days.
    expect(lifeDayNumber("2004-06-06")).toBe(732);
  });

  it("no day of life before birth", () => {
    expect(lifeDayNumber("2002-06-05")).toBeNull();
  });
});

describe("lifeDayLabel", () => {
  it("captions the day-of-life number", () => {
    expect(lifeDayLabel(BIRTH_DATE)).toBe("1-й день жизни");
  });

  it("declines the ordinal numeral by the last digit", () => {
    // The Russian masculine ordinal takes only its final letter after digits.
    expect(lifeDayLabel("2026-08-11")).toBe("8833-й день жизни");
  });

  it("no caption before birth", () => {
    expect(lifeDayLabel("1999-01-01")).toBeNull();
  });
});
