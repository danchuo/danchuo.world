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

/** Ночь длиной в реальные семь часов — на ней и проверяется кладка. */
const longBand = (runs: [SleepBandView["parts"][number]["stage"], number][]): SleepBandView => {
  let at = 0;
  const parts = runs.map(([stage, len]) => {
    const part = { stage, fromMinute: at, toMinute: at + len };
    at += len;
    return part;
  });
  return { onsetMinute: 0, wakeMinute: at, asleepMinutes: at, asleepFromMinute: 0, parts };
};

const countBy = (bricks: { stage: string }[]) =>
  bricks.reduce<Record<string, number>>((acc, b) => ({ ...acc, [b.stage]: (acc[b.stage] ?? 0) + 1 }), {});

describe("echoNight — ночь брусками", () => {
  it("сводит минуты к кладке и считает итоги в МИНУТАХ", () => {
    const night = echoNight(band)!;

    expect(night.bricks).toHaveLength(64);
    // Итоги подписи считаются по данным, а не по рисунку: кладка их огрубляет, подпись — нет.
    expect(night.totals).toEqual({ awake: 10, light: 60, deep: 30, rem: 20 });
    // Пробуждения в сумму сна не входят — как «Time Asleep» у Apple (§7.7).
    expect(night.asleep).toBe(110);
    expect(night.timed).toBe(true);
  });

  it("нумерует брусок внутри его фазы сквозь всю ночь, а не внутри куска", () => {
    // На этом ранге стоит вся сумма: два разнесённых куска одной фазы обязаны сложиться
    // в один брусок, иначе бруски суммы перекрывали бы друг друга.
    const night = echoNight(band)!;
    const light = night.bricks.filter((b) => b.stage === "light");

    expect(light.map((b) => b.rank)).toEqual([...Array(light.length).keys()]);
  });

  it("держит долю фазы в кладке с точностью до бруска", () => {
    const night = echoNight(band)!;
    const laid = countBy(night.bricks);

    // 10 / 40 / 30 / 40 минут из 120 ⇒ 5.3 / 21.3 / 16 / 21.3 бруска из 64.
    expect(laid.awake).toBe(5);
    expect(laid.deep).toBe(16);
    expect(laid.light + laid.deep + laid.rem + laid.awake).toBe(64);
  });

  it("не теряет короткие разрозненные пробуждения, проигрывающие своему окну", () => {
    // Семь часов сна с четырьмя пробуждениями по 4 минуты: окно кладки шире любого из них,
    // и голосованием по окну «не спал» пропал бы с рисунка целиком, оставшись в подписи.
    const night = echoNight(
      longBand([
        ["light", 90],
        ["awake", 4],
        ["deep", 70],
        ["awake", 4],
        ["rem", 60],
        ["awake", 4],
        ["light", 130],
        ["awake", 4],
        ["rem", 54],
      ]),
    )!;

    expect(night.totals.awake).toBe(16);
    expect(countBy(night.bricks).awake).toBeGreaterThan(0);
  });

  it("короткую ночь не укрупняет: брусков не больше, чем минут", () => {
    const short = echoNight(longBand([["light", 30], ["deep", 10]]))!;
    expect(short.bricks).toHaveLength(40);
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

  it("даёт по столбу на брусок и застилает ширину целиком", () => {
    expect(geometry.columns).toHaveLength(64);
    const last = geometry.columns[63];
    const pitch = ECHO_VIEW.width / 64;
    // Последний брусок кончается на просвет раньше края — кладка ровная, а не приклеенная.
    expect(last.x + pitch).toBeCloseTo(ECHO_VIEW.width);
  });

  it("оставляет между брусками просвет, а не склеивает их в заливку", () => {
    const pitch = ECHO_VIEW.width / 64;
    expect(geometry.columns[0].width).toBeLessThan(pitch);
    expect(geometry.columns[0].width).toBeGreaterThan(pitch * 0.5);
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
    // Сдвиг ставит брусок на его ранг, а не на новое место с нуля: значит бруски суммы
    // выложены теми же столбами и ни один не потерян и не удвоен.
    const pitch = ECHO_VIEW.width / 64;
    const summed = geometry.columns.map((c) => Math.round((c.x + c.shift) / pitch));
    expect(summed).toEqual(night.bricks.map((b) => b.rank));
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
    // Профиль ставит точку только на границе фаз: внутри куска дно не меняется.
    const runs = night.bricks.filter((b, i) => i === 0 || night.bricks[i - 1].stage !== b.stage).length;
    expect(geometry.profile.split(" ")).toHaveLength(runs * 2);
  });
});
