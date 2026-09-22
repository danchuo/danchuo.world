import { describe, expect, it } from "vitest";
import { formatCost, formatDuration, formatKm, formatRideCost, formatStationAddress, pluralRu, rublesWhole } from "./rideFormat";

describe("formatKm", () => {
  it("under a kilometre — in metres", () => {
    expect(formatKm(650)).toBe("650 м");
    expect(formatKm(0)).toBe("0 м");
  });
  it("from a kilometre — with one decimal", () => {
    expect(formatKm(42520)).toBe("42.5 км");
  });
  it("a whole number of kilometres is written without a zero fraction", () => {
    // A trailing ".0" promises precision the number does not have and pulls the eye to the zero.
    expect(formatKm(5000)).toBe("5 км");
    expect(formatKm(3000)).toBe("3 км");
    // Rounding to tenths can ITSELF produce a whole number — the tail is dropped then too.
    expect(formatKm(2998)).toBe("3 км");
    expect(formatKm(1040)).toBe("1 км");
    // A non-zero tenth stays.
    expect(formatKm(1050)).toBe("1.1 км");
  });
});

describe("formatDuration", () => {
  it("under an hour — minutes", () => {
    expect(formatDuration(1798)).toBe("30 мин"); // 29.97 min → rounded
    expect(formatDuration(321)).toBe("5 мин");
  });
  it("from an hour — hours and minutes", () => {
    expect(formatDuration(16586)).toBe("4 ч 36 мин");
    expect(formatDuration(3600)).toBe("1 ч");
  });
});

describe("formatCost", () => {
  it("kopecks → roubles with rounding", () => {
    expect(formatCost(5243)).toBe("52 ₽");
    expect(formatCost(96621)).toBe("966 ₽");
  });
  it("zero and below — free", () => {
    expect(formatCost(0)).toBe("бесплатно");
    expect(formatCost(-10)).toBe("бесплатно");
  });
});

describe("formatRideCost", () => {
  const cost = (
    costKopecks: number | null,
    accessKopecks: number | null = null,
    coveredByTariffKopecks: number | null = null,
  ) => formatRideCost({ costKopecks, accessKopecks, coveredByTariffKopecks });

  it("access bought for the ride, with an overage on top — in full and itemised", () => {
    // An hour for 399 ₽ plus 2 minutes over: the board used to show the 7 ₽ alone and lied.
    expect(cost(749, 39900)).toBe("406 ₽ (доступ 399 + 7 сверх)");
    expect(cost(1498, 4000)).toBe("55 ₽ (доступ 40 + 15 сверх)");
  });
  it("access bought, no overage — the access price", () => {
    expect(cost(0, 39900)).toBe("399 ₽");
  });
  it("a ride under a previously bought pack — the overage is marked \"over the tariff\"", () => {
    expect(cost(15400, null, 39900)).toBe("154 ₽ сверх тарифа");
  });
  it("a free ride under a previously bought pack — \"within the N ₽ tariff\"", () => {
    expect(cost(0, null, 90000)).toBe("в рамках тарифа за 900 ₽");
  });
  it("a paid ride without purchases in the history — just roubles (old rides)", () => {
    expect(cost(5243)).toBe("52 ₽");
  });
  it("a free ride without a covering tariff — \"free\"", () => {
    expect(cost(0)).toBe("бесплатно");
    expect(cost(0, null, 0)).toBe("бесплатно");
  });
  it("no cost data — empty", () => {
    expect(cost(null)).toBe("");
    expect(cost(null, null, 90000)).toBe("");
  });
  it("access exists but no cost — the access price", () => {
    expect(cost(null, 4000)).toBe("40 ₽");
  });
});

describe("pluralRu", () => {
  const rides: [string, string, string] = ["поездка", "поездки", "поездок"];
  it("one — form [0]", () => {
    expect(pluralRu(1, rides)).toBe("поездка");
    expect(pluralRu(21, rides)).toBe("поездка");
  });
  it("two to four — form [1]", () => {
    expect(pluralRu(2, rides)).toBe("поездки");
    expect(pluralRu(3, rides)).toBe("поездки");
    expect(pluralRu(24, rides)).toBe("поездки");
  });
  it("five and more — form [2]", () => {
    expect(pluralRu(0, rides)).toBe("поездок");
    expect(pluralRu(5, rides)).toBe("поездок");
    expect(pluralRu(20, rides)).toBe("поездок");
  });
  it("11..14 is always form [2] (special case)", () => {
    expect(pluralRu(11, rides)).toBe("поездок");
    expect(pluralRu(12, rides)).toBe("поездок");
    expect(pluralRu(14, rides)).toBe("поездок");
  });
});

describe("formatStationAddress", () => {
  it("the \"just the city\" placeholder (a bike off-station) — \"off-station\"", () => {
    expect(formatStationAddress("Москва")).toBe("вне станции");
    expect(formatStationAddress("  Москва  ")).toBe("вне станции");
    expect(formatStationAddress("Зеленоград")).toBe("вне станции");
  });
  it("a real address passes as is", () => {
    expect(formatStationAddress("ст. м. Молодёжная (выход № 2)")).toBe("ст. м. Молодёжная (выход № 2)");
    expect(formatStationAddress("ул. Ельнинская, д. 14к1")).toBe("ул. Ельнинская, д. 14к1");
  });
  it("extra spaces collapse (raw PWA data with double spaces)", () => {
    expect(formatStationAddress(" ул. Краснобогатырская,  д. 2 стр. 93")).toBe("ул. Краснобогатырская, д. 2 стр. 93");
  });
  it("null stays null (a ride may have no address lines)", () => {
    expect(formatStationAddress(null)).toBeNull();
  });
});

describe("rublesWhole", () => {
  it("kopecks → whole roubles with rounding", () => {
    expect(rublesWhole(39900)).toBe(399);
    expect(rublesWhole(44100)).toBe(441);
    expect(rublesWhole(0)).toBe(0);
  });
});
