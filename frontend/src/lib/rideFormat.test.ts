import { describe, expect, it } from "vitest";
import { formatCost, formatDuration, formatKm, formatRideCost, formatStationAddress, pluralRu, rublesWhole } from "./rideFormat";

describe("formatKm", () => {
  it("ниже километра — в метрах", () => {
    expect(formatKm(650)).toBe("650 м");
    expect(formatKm(0)).toBe("0 м");
  });
  it("от километра — с одним знаком", () => {
    expect(formatKm(5000)).toBe("5.0 км");
    expect(formatKm(42520)).toBe("42.5 км");
  });
});

describe("formatDuration", () => {
  it("ниже часа — минуты", () => {
    expect(formatDuration(1798)).toBe("30 мин"); // 29.97 мин → округление
    expect(formatDuration(321)).toBe("5 мин");
  });
  it("от часа — часы и минуты", () => {
    expect(formatDuration(16586)).toBe("4 ч 36 мин");
    expect(formatDuration(3600)).toBe("1 ч");
  });
});

describe("formatCost", () => {
  it("копейки → рубли с округлением", () => {
    expect(formatCost(5243)).toBe("52 ₽");
    expect(formatCost(96621)).toBe("966 ₽");
  });
  it("ноль и меньше — бесплатно", () => {
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

  it("доступ куплен ради поездки, сверху превышение — целиком и с разбором", () => {
    // Час за 399 ₽ + 2 минуты превышения: витрина показывала одни 7 ₽ и врала.
    expect(cost(749, 39900)).toBe("406 ₽ (доступ 399 + 7 сверх)");
    expect(cost(1498, 4000)).toBe("55 ₽ (доступ 40 + 15 сверх)");
  });
  it("доступ куплен, превышения нет — цена доступа", () => {
    expect(cost(0, 39900)).toBe("399 ₽");
  });
  it("поездка под ранее купленным пакетом — превышение помечено «сверх тарифа»", () => {
    expect(cost(15400, null, 39900)).toBe("154 ₽ сверх тарифа");
  });
  it("бесплатная под ранее купленным пакетом — «в рамках тарифа за N ₽»", () => {
    expect(cost(0, null, 90000)).toBe("в рамках тарифа за 900 ₽");
  });
  it("платная без покупок в истории — просто рубли (старые поездки)", () => {
    expect(cost(5243)).toBe("52 ₽");
  });
  it("бесплатная без покрывающего тарифа — «бесплатно»", () => {
    expect(cost(0)).toBe("бесплатно");
    expect(cost(0, null, 0)).toBe("бесплатно");
  });
  it("нет данных о стоимости — пусто", () => {
    expect(cost(null)).toBe("");
    expect(cost(null, null, 90000)).toBe("");
  });
  it("доступ есть, а стоимости нет — цена доступа", () => {
    expect(cost(null, 4000)).toBe("40 ₽");
  });
});

describe("pluralRu", () => {
  const rides: [string, string, string] = ["поездка", "поездки", "поездок"];
  it("одна — форма [0]", () => {
    expect(pluralRu(1, rides)).toBe("поездка");
    expect(pluralRu(21, rides)).toBe("поездка");
  });
  it("две-четыре — форма [1]", () => {
    expect(pluralRu(2, rides)).toBe("поездки");
    expect(pluralRu(3, rides)).toBe("поездки");
    expect(pluralRu(24, rides)).toBe("поездки");
  });
  it("пять и больше — форма [2]", () => {
    expect(pluralRu(0, rides)).toBe("поездок");
    expect(pluralRu(5, rides)).toBe("поездок");
    expect(pluralRu(20, rides)).toBe("поездок");
  });
  it("11..14 — всегда форма [2] (особый случай)", () => {
    expect(pluralRu(11, rides)).toBe("поездок");
    expect(pluralRu(12, rides)).toBe("поездок");
    expect(pluralRu(14, rides)).toBe("поездок");
  });
});

describe("formatStationAddress", () => {
  it("заглушка «просто город» (велосипед вне станции) — «вне станции»", () => {
    expect(formatStationAddress("Москва")).toBe("вне станции");
    expect(formatStationAddress("  Москва  ")).toBe("вне станции");
    expect(formatStationAddress("Зеленоград")).toBe("вне станции");
  });
  it("настоящий адрес проходит как есть", () => {
    expect(formatStationAddress("ст. м. Молодёжная (выход № 2)")).toBe("ст. м. Молодёжная (выход № 2)");
    expect(formatStationAddress("ул. Ельнинская, д. 14к1")).toBe("ул. Ельнинская, д. 14к1");
  });
  it("лишние пробелы схлопываются (сырьё PWA с двойными пробелами)", () => {
    expect(formatStationAddress(" ул. Краснобогатырская,  д. 2 стр. 93")).toBe("ул. Краснобогатырская, д. 2 стр. 93");
  });
  it("null остаётся null (строки адресов у поездки может не быть)", () => {
    expect(formatStationAddress(null)).toBeNull();
  });
});

describe("rublesWhole", () => {
  it("копейки → целые рубли с округлением", () => {
    expect(rublesWhole(39900)).toBe(399);
    expect(rublesWhole(44100)).toBe(441);
    expect(rublesWhole(0)).toBe(0);
  });
});
