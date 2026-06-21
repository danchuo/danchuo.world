import { describe, expect, it } from "vitest";
import { formatAgo, formatFraction, formatSleep, formatSteps, isDisciplineDone, NO_DATA } from "./format";

describe("format (null != 0, PRD 5.4)", () => {
  it("null -> «нет данных», но реальный 0 показывается как 0", () => {
    expect(formatSteps(null)).toBe(NO_DATA);
    expect(formatSteps(0)).toBe("0"); // ключевое: 0 не схлопывается в «нет данных»
    expect(formatSleep(null)).toBe(NO_DATA);
    expect(formatSleep(0)).toBe("0 мин");
  });

  it("formatSteps группирует разряды", () => {
    // ru-RU вставляет неразрывный пробел (NBSP/NNBSP) — \s в JS его ловит, нормализуем.
    expect(formatSteps(8421).replace(/\s/gu, " ")).toBe("8 421");
  });

  it("formatSleep раскладывает минуты в часы/минуты", () => {
    expect(formatSleep(437)).toBe("7 ч 17 мин");
    expect(formatSleep(120)).toBe("2 ч");
    expect(formatSleep(45)).toBe("45 мин");
  });

  it("дисциплина - дробью, закрытый пункт детектится", () => {
    expect(formatFraction(2, 2)).toBe("2/2");
    expect(isDisciplineDone(2, 2)).toBe(true);
    expect(isDisciplineDone(1, 2)).toBe(false);
  });
});

describe("formatAgo (свежесть, PRD 8)", () => {
  const now = Date.parse("2026-06-21T12:00:00Z");

  it("ступени единиц: только что / мин / ч / дн", () => {
    expect(formatAgo("2026-06-21T11:59:30Z", now)).toBe("только что");
    expect(formatAgo("2026-06-21T11:45:00Z", now)).toBe("15 мин назад");
    expect(formatAgo("2026-06-21T09:00:00Z", now)).toBe("3 ч назад");
    expect(formatAgo("2026-06-19T12:00:00Z", now)).toBe("2 дн назад");
  });

  it("будущая метка (часы рассинхронизированы) не уходит в минус", () => {
    expect(formatAgo("2026-06-21T12:00:30Z", now)).toBe("только что");
  });

  it("невалидный ISO → пустая строка", () => {
    expect(formatAgo("не-дата", now)).toBe("");
  });
});
