import { describe, expect, it } from "vitest";
import {
  HEAD_MAX_AGE_MS,
  elapsedMs,
  formatClock,
  headSample,
  progressRatio,
  type ProgressSample,
} from "./musicProgress";

/** A snapshot: "the server's answer arrived at moment T with the playhead at P". */
function sample(progressMs: number | null, atMs: number, isPlaying: boolean): ProgressSample {
  return { progressMs, atMs, isPlaying };
}

describe("elapsedMs", () => {
  it("на паузе головка стоит — сколько сервер сказал, столько и есть", () => {
    expect(elapsedMs(sample(107_000, 1_000, false), 60_000, 390_000)).toBe(107_000);
  });

  it("пока играет — головка едет вместе с часами", () => {
    // The answer arrived at ms 1000 with the head at 107s; three seconds later it must be at 110s.
    expect(elapsedMs(sample(107_000, 1_000, true), 4_000, 390_000)).toBe(110_000);
  });

  it("не переезжает конец трека", () => {
    // The tab was hidden for half an hour — with no ceiling the head would run past the duration.
    expect(elapsedMs(sample(380_000, 0, true), 1_800_000, 390_000)).toBe(390_000);
  });

  it("без длительности потолка нет — но и врать нечем, отдаём как есть", () => {
    expect(elapsedMs(sample(380_000, 0, true), 400_000, null)).toBe(780_000);
  });

  it("часы, ушедшие назад, головку не отматывают", () => {
    // The system clock can jump backwards (an NTP sync); the progress need not follow.
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
    // A zero duration is a division by zero, not "the track is finished".
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
    // 1:47.9 on a player's screen is still 1:47: a second arrives rather than rounds.
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
    // A copy in localStorage may sit for a day: extrapolating from it would show the track played
    // out, when it is not even known whether it is playing.
    const stale = headSample(107_000, 0, true, HEAD_MAX_AGE_MS + 1);
    expect(stale.progressMs).toBeNull();
    expect(stale.isPlaying).toBe(false);
  });

  it("граница возраста включительно — снимок ровно в возрасте потолка ещё годен", () => {
    expect(headSample(107_000, 0, true, HEAD_MAX_AGE_MS).progressMs).toBe(107_000);
  });

  it("копия из кэша встаёт на своё место, а не в начало трека", () => {
    // Exactly an F5 inside the polling window: the snapshot was written 12s ago. Without anchoring
    // to its OWN time the scale would roll back and then catch up in a jump.
    const sample = headSample(107_000, 1_000, true, 13_000);
    expect(elapsedMs(sample, 13_000, 390_000)).toBe(119_000);
  });
});
