import { describe, expect, it } from "vitest";
import {
  HEAD_MAX_AGE_MS,
  elapsedMs,
  formatClock,
  headSample,
  progressRatio,
  type ProgressSample,
} from "./musicProgress";

/** Снимок «пришёл ответ сервера в момент T с головкой P». */
function sample(progressMs: number | null, atMs: number, isPlaying: boolean): ProgressSample {
  return { progressMs, atMs, isPlaying };
}

describe("elapsedMs", () => {
  it("на паузе головка стоит — сколько сервер сказал, столько и есть", () => {
    expect(elapsedMs(sample(107_000, 1_000, false), 60_000, 390_000)).toBe(107_000);
  });

  it("пока играет — головка едет вместе с часами", () => {
    // Ответ приехал на 1000-й мс с головкой 107с; спустя 3с головка должна быть на 110с.
    expect(elapsedMs(sample(107_000, 1_000, true), 4_000, 390_000)).toBe(110_000);
  });

  it("не переезжает конец трека", () => {
    // Вкладка была скрыта полчаса — без потолка головка ушла бы далеко за длительность.
    expect(elapsedMs(sample(380_000, 0, true), 1_800_000, 390_000)).toBe(390_000);
  });

  it("без длительности потолка нет — но и врать нечем, отдаём как есть", () => {
    expect(elapsedMs(sample(380_000, 0, true), 400_000, null)).toBe(780_000);
  });

  it("часы, ушедшие назад, головку не отматывают", () => {
    // Системное время может прыгнуть назад (синхронизация NTP); прогресс от этого не обязан.
    expect(elapsedMs(sample(107_000, 10_000, true), 4_000, 390_000)).toBe(107_000);
  });

  it("нет головки — нечего показывать", () => {
    expect(elapsedMs(sample(null, 0, true), 5_000, 390_000)).toBeNull();
  });
});

describe("progressRatio", () => {
  it("доля пройденного", () => {
    expect(progressRatio(195_000, 390_000)).toBe(0.5);
  });

  it("зажата в [0, 1]", () => {
    expect(progressRatio(500_000, 390_000)).toBe(1);
    expect(progressRatio(-10, 390_000)).toBe(0);
  });

  it("без длительности или головки доли нет", () => {
    expect(progressRatio(195_000, null)).toBeNull();
    expect(progressRatio(null, 390_000)).toBeNull();
    // Нулевая длительность — деление на ноль, а не «трек пройден».
    expect(progressRatio(0, 0)).toBeNull();
  });
});

describe("formatClock", () => {
  it("минуты и секунды", () => {
    expect(formatClock(107_000)).toBe("1:47");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(9_000)).toBe("0:09");
  });

  it("секунды округляются ВНИЗ — как в плеере", () => {
    // 1:47.9 на экране плеера всё ещё 1:47: секунда «наступает», а не «округляется».
    expect(formatClock(107_900)).toBe("1:47");
  });

  it("длинный трек уходит в часы", () => {
    expect(formatClock(3_600_000)).toBe("1:00:00");
    expect(formatClock(3_725_000)).toBe("1:02:05");
  });

  it("нечего показывать — прочерк той же ширины", () => {
    expect(formatClock(null)).toBe("–:––");
  });

  it("отрицательного времени не бывает", () => {
    expect(formatClock(-5_000)).toBe("0:00");
  });
});

describe("headSample", () => {
  it("свежий снимок отдаётся как есть", () => {
    expect(headSample(107_000, 1_000, true, 5_000)).toEqual({
      progressMs: 107_000,
      atMs: 1_000,
      isPlaying: true,
    });
  });

  it("протухший снимок головки не даёт", () => {
    // Копия из localStorage может пролежать сутки: досчитывать по ней значило бы показать
    // трек доигранным до конца, хотя на деле неизвестно даже, играет ли он.
    const stale = headSample(107_000, 0, true, HEAD_MAX_AGE_MS + 1);
    expect(stale.progressMs).toBeNull();
    expect(stale.isPlaying).toBe(false);
  });

  it("граница возраста включительно — снимок ровно в возрасте потолка ещё годен", () => {
    expect(headSample(107_000, 0, true, HEAD_MAX_AGE_MS).progressMs).toBe(107_000);
  });

  it("копия из кэша встаёт на своё место, а не в начало трека", () => {
    // Ровно случай F5 внутри окна опроса: снимок записан 12с назад с головкой 1:47.
    // Без опоры на его СОБСТВЕННОЕ время шкала откатывалась бы к 1:47 и догоняла рывком.
    const sample = headSample(107_000, 1_000, true, 13_000);
    expect(elapsedMs(sample, 13_000, 390_000)).toBe(119_000);
  });
});
