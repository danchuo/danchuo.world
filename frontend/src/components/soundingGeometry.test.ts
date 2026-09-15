import { describe, expect, it } from "vitest";
import type { SleepBandView } from "@/lib/api/types";
import { ECHO_VIEW, echoGeometry, echoNight, echoNightFromStages } from "./soundingGeometry";

const band: SleepBandView = {
  onsetMinute: 300,
  wakeMinute: 420,
  asleepMinutes: 110,
  asleepFromMinute: 310,
  parts: [
    { stage: "awake", fromMinute: 300, toMinute: 310 },
    { stage: "light", fromMinute: 310, toMinute: 350 },
    { stage: "deep", fromMinute: 350, toMinute: 380 },
    { stage: "rem", fromMinute: 380, toMinute: 400 },
    { stage: "light", fromMinute: 400, toMinute: 420 },
  ],
};

describe("echoNight — ночь по минутам", () => {
  it("разворачивает куски в минуты и считает итоги", () => {
    const night = echoNight(band)!;

    expect(night.minutes).toHaveLength(120);
    expect(night.totals).toEqual({ awake: 10, light: 60, deep: 30, rem: 20 });
    // Пробуждения в сумму сна не входят — как «Time Asleep» у Apple (§7.7).
    expect(night.asleep).toBe(110);
    expect(night.timed).toBe(true);
  });

  it("нумерует минуту внутри её фазы сквозь всю ночь, а не внутри куска", () => {
    // На этом ранге стоит вся сумма: два разнесённых куска одной фазы обязаны сложиться
    // в один брусок, иначе бруски суммы перекрывали бы друг друга.
    const night = echoNight(band)!;
    const light = night.minutes.filter((m) => m.stage === "light");

    expect(light.map((m) => m.rank)).toEqual([...Array(60).keys()]);
    expect(light[40].index).toBe(100); // первая минута ВТОРОГО куска базового сна
    expect(light[40].rank).toBe(40);
  });

  it("ночи без сохранённых кусков не бывает", () => {
    expect(echoNight(null)).toBeNull();
    expect(echoNight({ ...band, parts: [] })).toBeNull();
  });

  it("ночь из одних пробуждений — это не ночь", () => {
    const awakeOnly = { ...band, parts: [{ stage: "awake" as const, fromMinute: 300, toMinute: 320 }] };
    expect(echoNight(awakeOnly)).toBeNull();
  });
});

describe("echoNightFromStages — деградация без хронологии", () => {
  it("собирает те же итоги и честно помечает, что времени в ней нет", () => {
    const night = echoNightFromStages({ rem: 20, deep: 30, light: 60, awake: 10 })!;

    expect(night.totals).toEqual({ awake: 10, light: 60, deep: 30, rem: 20 });
    expect(night.asleep).toBe(110);
    // Переключать в такой ночи нечего: «по часам» показал бы выдуманный порядок.
    expect(night.timed).toBe(false);
  });

  it("нет фаз — нет и эхолота", () => {
    expect(echoNightFromStages(null)).toBeNull();
    expect(echoNightFromStages({ rem: null, deep: null, light: null, awake: 40 })).toBeNull();
  });
});

describe("echoGeometry — промер глубины", () => {
  const night = echoNight(band)!;
  const geometry = echoGeometry(night);

  it("даёт по столбу на минуту и застилает ширину целиком", () => {
    expect(geometry.columns).toHaveLength(120);
    const last = geometry.columns[119];
    expect(last.x + last.width).toBeGreaterThanOrEqual(ECHO_VIEW.width);
  });

  it("роняет столб тем глубже, чем глубже фаза", () => {
    const floorOf = (stage: string) => {
      const c = geometry.columns.find((col) => col.stage === stage)!;
      return c.y + c.height;
    };
    // Порядок дорожек один на все редакции виджета (LANES): не спал → REM → базовый → глубокий.
    expect(floorOf("awake")).toBeLessThan(floorOf("rem"));
    expect(floorOf("rem")).toBeLessThan(floorOf("light"));
    expect(floorOf("light")).toBeLessThan(floorOf("deep"));
  });

  it("сумма — пересортировка тех же столбов: площадь сохраняется по построению", () => {
    // Сдвиг ставит минуту на её ранг, а не на новое место с нуля: значит бруски суммы
    // выложены теми же столбами и ни один не потерян и не удвоен.
    const pitch = ECHO_VIEW.width / 120;
    const summed = geometry.columns.map((c, i) => Math.round((c.x + c.shift) / pitch));
    expect(summed).toEqual(night.minutes.map((m) => m.rank));
  });

  it("сжимает столб ко дну его горизонта — дно не двигается", () => {
    for (const c of geometry.columns) {
      const floor = c.y + c.height;
      // Сжатие идёт от нижней кромки (transform-origin: 50% 100%), поэтому дно бруска
      // остаётся на своём горизонте — глубина читается и в сумме.
      expect(c.height * c.squash).toBeLessThan(c.height);
      expect(floor - c.height * c.squash).toBeGreaterThan(c.y);
    }
  });

  it("рисует горизонты и ступенчатый профиль дна", () => {
    expect(geometry.floors).toHaveLength(4);
    // Пять кусков ночи ⇒ по две точки на кусок: внутри куска дно не меняется.
    expect(geometry.profile.split(" ")).toHaveLength(10);
  });
});
