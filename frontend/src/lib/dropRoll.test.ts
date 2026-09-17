import { describe, expect, it } from "vitest";
import {
  FRAME_WHEEL_GAP_MS,
  FRAME_WHEEL_TRAVEL_PX,
  SWIPE_NOTCH,
  centerScroll,
  frameWheelStep,
  initialFrameWheel,
  nearestFrameIndex,
  rollMotionStep,
  startFrameIndex,
  stepFrameIndex,
  stripPadding,
  swipeStep,
  tickIndexAt,
  toothHeight,
  wheelStep,
} from "./dropRoll";

describe("nearestFrameIndex", () => {
  const centers = [58, 180, 302, 424, 546];

  it("берёт кадр, чей центр ближе к середине окна", () => {
    expect(nearestFrameIndex(centers, 190)).toBe(1);
    expect(nearestFrameIndex(centers, 290)).toBe(2);
  });

  it("на краях отдаёт крайние кадры", () => {
    expect(nearestFrameIndex(centers, 0)).toBe(0);
    expect(nearestFrameIndex(centers, 9999)).toBe(4);
  });

  it("при равном расстоянии оставляет тот, что раньше в ленте", () => {
    expect(nearestFrameIndex(centers, 119)).toBe(0);
  });

  it("пустая лента ⇒ 0 (кадра нет, но индекс обязан быть)", () => {
    expect(nearestFrameIndex([], 100)).toBe(0);
  });
});

describe("startFrameIndex", () => {
  const photos = [{ imageUrl: "/a" }, { imageUrl: "/b" }, { imageUrl: "/c" }];

  it("открывает ИМЕННО тот кадр, что показывала плитка", () => {
    expect(startFrameIndex(photos, "/c")).toBe(2);
  });

  it("без адреса — первый кадр", () => {
    expect(startFrameIndex(photos)).toBe(0);
    expect(startFrameIndex(photos, null)).toBe(0);
  });

  it("узнаёт кадр и по адресу превью: обложка дропа приезжает именно thumb-адресом", () => {
    const withThumbs = [
      { imageUrl: "/a/web", thumbUrl: "/a/thumb" },
      { imageUrl: "/b/web", thumbUrl: "/b/thumb" },
    ];
    expect(startFrameIndex(withThumbs, "/b/thumb")).toBe(1);
  });

  it("адрес не из этого дропа ⇒ первый кадр, а не пустота", () => {
    expect(startFrameIndex(photos, "/z")).toBe(0);
    expect(startFrameIndex([], "/a")).toBe(0);
  });
});

describe("stripPadding", () => {
  it("боковой запас = полокна минус полкадра: крайние кадры встают по центру", () => {
    expect(stripPadding(500, 116)).toBe(192);
  });

  it("кадр шире окна ⇒ запаса нет (иначе лента уедет в минус)", () => {
    expect(stripPadding(100, 116)).toBe(0);
  });

  it("окно ещё не измерено ⇒ 0", () => {
    expect(stripPadding(0, 116)).toBe(0);
  });
});

describe("wheelStep", () => {
  it("щелчок мыши = ровно один кадр, сколько бы пикселей он ни принёс", () => {
    expect(wheelStep(0, 100, 0, 0)).toEqual({ dir: 1, acc: 0 });
    expect(wheelStep(0, -240, 0, 0)).toEqual({ dir: -1, acc: 0 });
  });

  it("мелкие дельты трекпада копятся и дают кадр только вместе", () => {
    const a = wheelStep(0, 12, 0, 0);
    expect(a).toEqual({ dir: 0, acc: 12 });
    const b = wheelStep(0, 12, 0, a.acc);
    expect(b).toEqual({ dir: 0, acc: 24 });
    const c = wheelStep(0, 20, 0, b.acc);
    expect(c).toEqual({ dir: 1, acc: 0 });
  });

  it("горизонтальный жест трекпада листает так же, как вертикальный", () => {
    expect(wheelStep(-100, 0, 0, 0)).toEqual({ dir: -1, acc: 0 });
  });

  it("дельта в строках (Firefox) переводится в пиксели", () => {
    expect(wheelStep(0, 3, 1, 0)).toEqual({ dir: 1, acc: 0 });
  });

  it("нулевое событие ничего не меняет", () => {
    expect(wheelStep(0, 0, 0, 17)).toEqual({ dir: 0, acc: 17 });
  });

  it("смена направления не тянет за собой накопленное в другую сторону", () => {
    const a = wheelStep(0, 20, 0, 0);
    const b = wheelStep(0, -20, 0, a.acc);
    expect(b).toEqual({ dir: 0, acc: 0 });
  });
});


describe("toothHeight", () => {
  it("прямо под курсором засечка вырастает до потолка", () => {
    expect(toothHeight(0, 78, 8, 30)).toBe(30);
  });

  it("за радиусом магнита засечка стоит на своей высоте", () => {
    expect(toothHeight(78, 78, 8, 30)).toBe(8);
    expect(toothHeight(400, 78, 8, 30)).toBe(8);
  });

  it("на половине радиуса добирает ровно половину прибавки (косинус в квадрате)", () => {
    expect(toothHeight(39, 78, 8, 30)).toBeCloseTo(19, 6);
  });

  it("спад симметричен: сторона курсора не важна", () => {
    expect(toothHeight(-30, 78, 8, 30)).toBe(toothHeight(30, 78, 8, 30));
  });

  it("у текущего кадра своя, большая база — под магнитом он не проваливается", () => {
    expect(toothHeight(78, 78, 26, 30)).toBe(26);
    expect(toothHeight(0, 78, 26, 30)).toBe(30);
  });

  it("радиус ещё не измерен ⇒ высота базовая, а не деление на ноль", () => {
    expect(toothHeight(0, 0, 8, 30)).toBe(8);
  });
});

describe("tickIndexAt", () => {
  it("засечка под курсором: ряд поделён на равные доли", () => {
    expect(tickIndexAt(0, 370, 37)).toBe(0);
    expect(tickIndexAt(105, 370, 37)).toBe(10);
    expect(tickIndexAt(369, 370, 37)).toBe(36);
  });

  it("промах за край ряда отдаёт крайнюю засечку, а не пустоту", () => {
    expect(tickIndexAt(-40, 370, 37)).toBe(0);
    expect(tickIndexAt(9999, 370, 37)).toBe(36);
  });

  it("ряд ещё не измерен ⇒ первая засечка", () => {
    expect(tickIndexAt(100, 0, 37)).toBe(0);
    expect(tickIndexAt(100, 370, 0)).toBe(0);
  });
});

describe("stepFrameIndex — сосед в пределах дропа", () => {
  it("шагает вперёд и назад", () => {
    expect(stepFrameIndex(2, 1, 6)).toBe(3);
    expect(stepFrameIndex(2, -1, 6)).toBe(1);
  });

  it("за краями шага нет: лента дропа не закольцована", () => {
    expect(stepFrameIndex(0, -1, 6)).toBe(0);
    expect(stepFrameIndex(5, 1, 6)).toBe(5);
  });

  it("дроп из одного кадра стоит на месте в обе стороны", () => {
    expect(stepFrameIndex(0, 1, 1)).toBe(0);
    expect(stepFrameIndex(0, -1, 1)).toBe(0);
  });
});

describe("rollMotionStep", () => {
  const cell = 124;

  it("в полупикселе от цели — встаёт ровно на неё, а не дрожит вечно", () => {
    expect(rollMotionStep(1000.3, 1000, 16.7, cell)).toBe(1000);
  });

  it("за кадр приближается к цели и никогда не проскакивает её", () => {
    const right = rollMotionStep(1000, 1124, 16.7, cell);
    expect(right).toBeGreaterThan(1000);
    expect(right).toBeLessThan(1124);
    const left = rollMotionStep(1124, 1000, 16.7, cell);
    expect(left).toBeLessThan(1124);
    expect(left).toBeGreaterThan(1000);
  });

  it("чем дальше отстала лента, тем большую ДОЛЮ пути берёт за кадр: быстрый щелчок догоняется быстрее", () => {
    const near = rollMotionStep(0, cell, 16.7, cell) / cell;
    const far = rollMotionStep(0, cell * 6, 16.7, cell) / (cell * 6);
    expect(far).toBeGreaterThan(near);
  });

  it("доля растёт не без предела: очень далёкая цель всё ещё не берётся одним прыжком", () => {
    expect(rollMotionStep(0, cell * 40, 16.7, cell)).toBeLessThan(cell * 40 * 0.6);
  });

  it("тягучесть — параметр ленты: с меньшей долей тот же путь берётся медленнее", () => {
    const usual = rollMotionStep(0, cell, 16.7, cell);
    const slow = rollMotionStep(0, cell, 16.7, cell, 0.13);
    expect(slow).toBeGreaterThan(0);
    expect(slow).toBeLessThan(usual);
  });

  it("медленная лента всё равно доезжает: за секунду она ровно на цели", () => {
    let pos = 0;
    for (let i = 0; i < 60; i += 1) pos = rollMotionStep(pos, cell, 16.7, cell, 0.13);
    expect(pos).toBe(cell);
  });

  it("зависший кадр отрисовки не превращается в прыжок: время считается не больше чем за два кадра", () => {
    expect(rollMotionStep(0, cell, 200, cell)).toBeCloseTo(rollMotionStep(0, cell, 1000 / 30, cell), 6);
  });

  it("нулевое время — лента на месте", () => {
    expect(rollMotionStep(500, 1000, 0, cell)).toBe(500);
  });
});

describe("swipeStep — перетаскивание кадра пальцем", () => {
  it("короткое движение кадр не листает, но копится", () => {
    const step = swipeStep(20, 0);
    expect(step.dir).toBe(0);
    expect(step.acc).toBe(20);
  });

  it("накопленное движение через порог стоит один кадр, остаток переносится", () => {
    // 20 was already accumulated and another 40 arrived — the threshold is crossed to the right,
    // which means back along the reel.
    const step = swipeStep(40, 20);
    expect(step.dir).toBe(-1);
    expect(step.acc).toBe(60 - SWIPE_NOTCH);
  });

  it("палец влево уводит ленту вперёд, вправо — назад", () => {
    expect(swipeStep(-SWIPE_NOTCH, 0).dir).toBe(1);
    expect(swipeStep(SWIPE_NOTCH, 0).dir).toBe(-1);
  });

  it("длинное движение не копит долг: остаток меньше порога", () => {
    const step = swipeStep(-SWIPE_NOTCH * 3, 0);
    expect(step.dir).toBe(1);
    expect(Math.abs(step.acc)).toBeLessThan(SWIPE_NOTCH * 3);
  });
});

describe("centerScroll — ячейка в середине окна", () => {
  it("ставит ячейку по центру окна", () => {
    // A 78px slot in a 246px window: 84px remain above and below — the slot is exactly centred.
    expect(centerScroll(168, 78, 246, 1000)).toBe(84);
  });

  it("окно равно ячейке — прокрутка ровно до её начала", () => {
    expect(centerScroll(168, 78, 78, 1000)).toBe(168);
  });

  it("первая ячейка стоит по центру запасом — прокрутка нулевая, а не отрицательная", () => {
    // The side padding (`stripPadding`) already centred the first cell: offset = 84.
    expect(centerScroll(84, 78, 246, 1000)).toBe(0);
  });

  it("за максимум прокрутки цель не уезжает: недостижимой точки не бывает", () => {
    expect(centerScroll(900, 78, 246, 300)).toBe(300);
  });
});

describe("frameWheelStep — шаг плитки «последний дроп» трекпадом", () => {
  /** A gesture as a stream of events every `gapMs`, from a clean state unless one is handed in. */
  function run(
    deltas: number[],
    { gapMs = 16, from = initialFrameWheel(), at = 1000, deltaMode = 0 } = {},
  ) {
    let state = from;
    let now = at;
    const steps: number[] = [];
    for (const dx of deltas) {
      const r = frameWheelStep(state, dx, deltaMode, now);
      state = r.state;
      if (r.dir !== 0) steps.push(r.dir);
      now += gapMs;
    }
    return { steps, state, now };
  }

  /** A flick as the trackpad sends it: a burst, then a long tail decaying geometrically. */
  const flick = (peak: number, decay = 0.94, count = 60) =>
    Array.from({ length: count }, (_, i) => peak * Math.pow(decay, i));

  it("непрерывный жест листает ровно один кадр", () => {
    expect(run(Array(120).fill(20)).steps).toEqual([1]);
  });

  it("один мах с инерцией стоит ОДНОГО кадра, а не двух", () => {
    // The tail outlives the burst and travels hundreds of pixels the person no longer controls.
    expect(run(flick(50)).steps).toEqual([1]);
  });

  it("ВТОРОЙ мах по хвосту первого листает снова — курсор при этом не двигают", () => {
    // The owner's complaint: after one swipe the next did nothing until the mouse was moved. The
    // tail keeps the event stream alive, so silence never comes; the new flick is told by its SIZE.
    const first = run(flick(50, 0.94, 30));
    const second = run(flick(50, 0.94, 30), { from: first.state, at: first.now });
    expect(first.steps).toEqual([1]);
    expect(second.steps).toEqual([1]);
  });

  it("медленный жест не теряет накопленное на паузах внутри себя", () => {
    // Events 100ms apart are still one gesture: only silence longer than the gap ends it.
    expect(run(Array(40).fill(8), { gapMs: 100 }).steps).toEqual([1]);
  });

  it("после тишины следующий мах листает заново", () => {
    const first = run(Array(20).fill(20));
    const second = run(Array(20).fill(20), { from: first.state, at: first.now + FRAME_WHEEL_GAP_MS });
    expect(second.steps).toEqual([1]);
  });

  it("шаг стоит пройденного пути, а не одного события", () => {
    expect(run([FRAME_WHEEL_TRAVEL_PX - 1]).steps).toEqual([]);
    expect(run([FRAME_WHEEL_TRAVEL_PX - 1, 1]).steps).toEqual([1]);
  });

  it("направление: вправо — следующий кадр, влево — предыдущий", () => {
    expect(run([FRAME_WHEEL_TRAVEL_PX]).steps).toEqual([1]);
    expect(run([-FRAME_WHEEL_TRAVEL_PX]).steps).toEqual([-1]);
  });

  it("разворот жеста обнуляет накопленное: передумавшему досчитывать нечего", () => {
    const half = run([60]);
    expect(half.state.acc).toBe(60);
    const back = frameWheelStep(half.state, -30, 0, half.now);
    expect(back.dir).toBe(0);
    expect(back.state.acc).toBe(-30);
  });

  it("дельта в строках (Firefox) переводится в пиксели, иначе порог недостижим", () => {
    const lines = FRAME_WHEEL_TRAVEL_PX / 2;
    expect(run([lines], { deltaMode: 1 }).steps).toEqual([1]);
    expect(run([lines], { deltaMode: 0 }).steps).toEqual([]);
  });
});
