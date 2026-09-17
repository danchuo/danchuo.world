import { describe, expect, it } from "vitest";
import {
  formatAgo,
  formatSleep,
  formatSleepAxis,
  formatSleepShort,
  sleepDurationParts,
  formatSteps,
  formatStepsAxis,
  isDisciplineDone,
  NO_DATA,
} from "./format";

describe("format (null != 0, PRD 5.4)", () => {
  it("null -> «нет данных», но реальный 0 показывается как 0", () => {
    expect(formatSteps(null)).toBe(NO_DATA);
    expect(formatSteps(0)).toBe("0"); // the point: 0 does not collapse into "no data"
    expect(formatSleep(null)).toBe(NO_DATA);
    expect(formatSleep(0)).toBe("0 мин");
  });

  it("formatSteps группирует разряды", () => {
    // ru-RU inserts a non-breaking space (NBSP/NNBSP); \s in JS catches it, so we normalise.
    expect(formatSteps(8421).replace(/\s/gu, " ")).toBe("8 421");
  });

  it("formatSleep раскладывает минуты в часы/минуты", () => {
    expect(formatSleep(437)).toBe("7 ч 17 мин");
    expect(formatSleep(120)).toBe("2 ч");
    expect(formatSleep(45)).toBe("45 мин");
  });

  it("закрытый пункт дисциплины детектится по порогу", () => {
    expect(isDisciplineDone(2, 2)).toBe(true);
    expect(isDisciplineDone(1, 2)).toBe(false);
  });

  it("метки оси Y: шаги в K, сон в ч", () => {
    expect(formatStepsAxis(0)).toBe("0");
    expect(formatStepsAxis(15000)).toBe("15K");
    expect(formatStepsAxis(7500)).toBe("7.5K");
    expect(formatSleepAxis(0)).toBe("0");
    expect(formatSleepAxis(600)).toBe("10ч");
    expect(formatSleepAxis(300)).toBe("5ч");
  });

  it("formatSleepShort — компактные единицы", () => {
    expect(formatSleepShort(null)).toBe(NO_DATA);
    expect(formatSleepShort(452)).toBe("7ч 32м");
    expect(formatSleepShort(120)).toBe("2ч");
    expect(formatSleepShort(45)).toBe("45м");
  });
});

describe("formatAgo (свежесть, PRD 8)", () => {
  const now = Date.parse("2026-06-21T12:00:00Z");

  it("ступени единиц: только что / мин / ч / дни", () => {
    expect(formatAgo("2026-06-21T11:59:30Z", now)).toBe("только что");
    expect(formatAgo("2026-06-21T11:45:00Z", now)).toBe("15 мин назад");
    expect(formatAgo("2026-06-21T09:00:00Z", now)).toBe("3 ч назад");
    expect(formatAgo("2026-06-20T12:00:00Z", now)).toBe("1 день назад");
    expect(formatAgo("2026-06-19T12:00:00Z", now)).toBe("2 дня назад");
    expect(formatAgo("2026-06-16T12:00:00Z", now)).toBe("5 дней назад");
    expect(formatAgo("2026-06-10T12:00:00Z", now)).toBe("11 дней назад");
    expect(formatAgo("2026-06-01T12:00:00Z", now)).toBe("20 дней назад");
    expect(formatAgo("2026-05-31T12:00:00Z", now)).toBe("21 день назад");
  });

  it("будущая метка (часы рассинхронизированы) не уходит в минус", () => {
    expect(formatAgo("2026-06-21T12:00:30Z", now)).toBe("только что");
  });

  it("невалидный ISO → пустая строка", () => {
    expect(formatAgo("не-дата", now)).toBe("");
  });
});

describe("sleepDurationParts (длительность ночи словами, DESIGN 7.7)", () => {
  const say = (m: number) => sleepDurationParts(m).map((p) => `${p.value} ${p.unit}`).join(" ");

  it("склоняет и час, и минуту по последней цифре", () => {
    expect(say(61)).toBe("1 час 1 минута");
    expect(say(3 * 60 + 2)).toBe("3 часа 2 минуты");
    expect(say(7 * 60 + 53)).toBe("7 часов 53 минуты");
    expect(say(5 * 60 + 25)).toBe("5 часов 25 минут");
  });

  it("одиннадцать–четырнадцать — исключение, а не «1» на конце", () => {
    expect(say(11 * 60 + 11)).toBe("11 часов 11 минут");
    expect(say(12 * 60 + 14)).toBe("12 часов 14 минут");
  });

  it("пустую половину не называет вовсе", () => {
    expect(sleepDurationParts(7 * 60)).toEqual([{ value: 7, unit: "часов" }]);
    expect(sleepDurationParts(40)).toEqual([{ value: 40, unit: "минут" }]);
  });
});
