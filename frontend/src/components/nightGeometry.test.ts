import { describe, expect, it } from "vitest";
import type { SleepBandView } from "@/lib/api/types";
import { clockLabel, nightBandGeometry } from "./nightGeometry";

/**
 * Геометрия полосы ночи (§7.7, идея I-23). Считается чистой функцией, а не замером контейнера:
 * jsdom не знает ResizeObserver, да и мерить нечего — всё выражается долями оси.
 */

/** Ночь 23:20 → 07:20 с пробуждением 06:00–06:20 (ось от 18:00 кануна). */
const band: SleepBandView = {
  onsetMinute: 320,
  wakeMinute: 800,
  asleepMinutes: 460,
  asleepFromMinute: 320,
  parts: [
    { stage: "light", fromMinute: 320, toMinute: 440 },
    { stage: "deep", fromMinute: 440, toMinute: 720 },
    { stage: "awake", fromMinute: 720, toMinute: 740 },
    { stage: "rem", fromMinute: 740, toMinute: 800 },
  ],
};

describe("nightBandGeometry", () => {
  it("растягивает ночь по оси в долях, а не в пикселях", () => {
    const g = nightBandGeometry(band)!;

    // Ось прижата к целым часам вокруг ночи: 23:00 (300) → 08:00 (840)
    expect(g.fromMinute).toBe(300);
    expect(g.toMinute).toBe(840);
    const span = 840 - 300;
    expect(g.parts[0].left).toBeCloseTo(((320 - 300) / span) * 100, 5);
    expect(g.parts[0].width).toBeCloseTo(((440 - 320) / span) * 100, 5);
    expect(g.parts.at(-1)!.left + g.parts.at(-1)!.width).toBeCloseTo(
      ((800 - 300) / span) * 100,
      5,
    );
  });

  it("держит фазы в том же порядке и не теряет пробуждение", () => {
    const g = nightBandGeometry(band)!;
    expect(g.parts.map((p) => p.stage)).toEqual([
      "light",
      "deep",
      "awake",
      "rem",
    ]);
  });

  it("оставляет провал в семплах дыркой, а не растягивает соседа", () => {
    const withHole: SleepBandView = {
      ...band,
      parts: [
        { stage: "light", fromMinute: 320, toMinute: 440 },
        { stage: "light", fromMinute: 500, toMinute: 800 },
      ],
    };
    const g = nightBandGeometry(withHole)!;
    const [first, second] = g.parts;
    expect(first.left + first.width).toBeLessThan(second.left);
  });

  it("раскладывает фазы по дорожкам сверху вниз, от бодрствования к глубокому сну", () => {
    const g = nightBandGeometry(band)!;
    const lane = Object.fromEntries(g.parts.map((p) => [p.stage, p.lane]));

    // Вертикаль теперь несёт глубину: не спал сверху, глубокий — у самого низа.
    expect(lane.awake).toBe(0);
    expect(lane.rem).toBe(1);
    expect(lane.light).toBe(2);
    expect(lane.deep).toBe(3);
  });

  it("подписывает шкалу часами по кругу суток", () => {
    const g = nightBandGeometry(band)!;
    expect(g.ticks.map((t) => t.label)).toEqual([
      "23:00",
      "01:00",
      "03:00",
      "05:00",
      "07:00",
    ]);
    expect(g.ticks[0].left).toBe(0);
  });

  it("без ночи геометрии нет вовсе", () => {
    expect(nightBandGeometry(null)).toBeNull();
    expect(nightBandGeometry({ ...band, parts: [] })).toBeNull();
  });
});

describe("clockLabel", () => {
  it("переводит минуту оси в часы суток", () => {
    expect(clockLabel(0)).toBe("18:00");
    expect(clockLabel(360)).toBe("00:00");
    expect(clockLabel(780)).toBe("07:00");
    expect(clockLabel(1440)).toBe("18:00");
  });
});
