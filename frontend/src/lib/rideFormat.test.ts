import { describe, expect, it } from "vitest";
import { formatCost, formatDuration, formatKm } from "./rideFormat";

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
