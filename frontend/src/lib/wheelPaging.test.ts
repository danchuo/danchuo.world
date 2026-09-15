import { describe, expect, it } from "vitest";
import {
  WHEEL_IDLE_MS,
  WHEEL_MIN_STEP_GAP_MS,
  WHEEL_NOTCH_PX,
  WHEEL_STEP_PX,
  initialWheelState,
  wheelStep,
  wheelTravel,
  type WheelState,
} from "./wheelPaging";

/** Прогоняет серию событий (travel, now) и возвращает выданные шаги. */
function run(events: Array<[travel: number, now: number]>, start: WheelState = initialWheelState()) {
  const steps: number[] = [];
  let state = start;
  for (const [travel, now] of events) {
    const r = wheelStep(state, travel, now);
    state = r.state;
    if (r.step !== 0) steps.push(r.step);
  }
  return { steps, state };
}

/** Ровный поток мелких дельт тачпада: `total` пикселей за шаги по `delta`, каждые 16мс. */
function glide(total: number, delta: number, from = 0): Array<[number, number]> {
  const events: Array<[number, number]> = [];
  const dir = Math.sign(total);
  for (let moved = 0, t = from; moved < Math.abs(total); moved += Math.abs(delta), t += 16) {
    events.push([dir * Math.abs(delta), t]);
  }
  return events;
}

describe("wheelTravel — доминирующая ось в пикселях (PRD §5.3)", () => {
  it("вертикаль: вниз — вперёд, вверх — назад", () => {
    expect(wheelTravel(0, 100, 0)).toBe(100);
    expect(wheelTravel(0, -100, 0)).toBe(-100);
  });

  it("горизонталь тачпада тоже листает: свайп влево (deltaX > 0) — вперёд", () => {
    expect(wheelTravel(60, 5, 0)).toBe(60);
    expect(wheelTravel(-60, 5, 0)).toBe(-60);
  });

  it("строки и страницы (deltaMode 1/2) переводятся в пиксели, а не считаются единицами", () => {
    // Firefox отдаёт колесо строками (3 за щелчок): без перевода три «пикселя» не дотянули бы
    // даже до щелчка, и колесо в нём листало бы втрое туже, чем в Chrome.
    expect(Math.abs(wheelTravel(0, 3, 1))).toBeGreaterThanOrEqual(WHEEL_NOTCH_PX);
    expect(Math.abs(wheelTravel(0, 1, 2))).toBeGreaterThanOrEqual(WHEEL_NOTCH_PX);
  });
});

describe("wheelStep — щелчок мыши дискретен, жест тачпада аналоговый", () => {
  it("щелчок колеса мыши — ровно одна неделя, без остатка", () => {
    expect(run([[100, 0]]).steps).toEqual([1]);
    expect(run([[-100, 0]]).steps).toEqual([-1]);
    // Щелчок вдвое крупнее недели не даёт двух: у мыши промежуточных положений нет.
    expect(run([[WHEEL_STEP_PX * 2, 0]]).steps).toEqual([1]);
  });

  it("сила жеста слышна: короткое движение не листает, длинное листает дальше", () => {
    // Порог — цена недели для мелких дельт. Ниже него окно стоит: это и есть «слабо».
    expect(run(glide(-WHEEL_STEP_PX * 0.6, -12)).steps).toEqual([]);
    const long = run(glide(-WHEEL_STEP_PX * 3, -12)).steps;
    expect(long.length).toBeGreaterThanOrEqual(2);
    expect(long.every((s) => s === -1)).toBe(true);
  });

  it("остаток жеста переносится: две половины подряд дают неделю, как одно движение", () => {
    // Иначе календарь «терял» пройденное на каждом шаге и тугел тем сильнее, чем мельче дельты.
    const half = glide(-WHEEL_STEP_PX * 0.9, -9);
    const { state } = run(half);
    expect(Math.abs(state.acc)).toBeGreaterThan(0);
    expect(run(glide(-WHEEL_STEP_PX * 0.9, -9, 16 * half.length), state).steps).toEqual([-1]);
  });

  it("инерционный хвост тачпада докатывает окно, а не глотается", () => {
    // Хвост — продолжение жеста, и раньше он съедался целиком: размашистый свайп двигал окно
    // ровно на неделю, сколько бы пикселей за ним ни прилетело.
    const tail: Array<[number, number]> = [];
    for (let t = 16, d = 30; t < 700; t += 16, d = Math.max(2, d * 0.93)) tail.push([-d, t]);
    expect(run([[-100, 0], ...tail]).steps.length).toBeGreaterThanOrEqual(3);
  });

  it("быстрое вращение колеса не обгоняет наплыв: между шагами держится зазор", () => {
    const { steps } = run([
      [-100, 0],
      [-100, 30],
      [-100, 60],
      [-100, 90],
    ]);
    expect(steps).toEqual([-1]);
  });

  it("отложенный шаг не пропадает — он уходит первым же событием после зазора", () => {
    const { steps } = run([
      [-100, 0],
      [-100, 30],
      [-5, WHEEL_MIN_STEP_GAP_MS + 1],
    ]);
    expect(steps).toEqual([-1, -1]);
  });

  it("очередь отложенного не растёт: жест кончился — окно встало", () => {
    // Иначе снятые с тачпада пальцы оставляли бы календарь ехать по накопленному запасу.
    const flick: Array<[number, number]> = [];
    for (let i = 0; i < 12; i++) flick.push([-100, i * 10]);
    const { state } = run(flick);
    expect(Math.abs(state.acc)).toBeLessThanOrEqual(WHEEL_STEP_PX);
  });

  it("накопленное сбрасывается после простоя: два ленивых касания с перерывом не складываются", () => {
    const { steps } = run([
      [-30, 0],
      [-30, WHEEL_IDLE_MS + 1],
    ]);
    expect(steps).toEqual([]);
  });

  it("смена направления не наследует накопленное чужого знака", () => {
    const { steps } = run([...glide(-WHEEL_STEP_PX * 0.9, -9), ...glide(WHEEL_STEP_PX * 0.9, 9, 200)]);
    expect(steps).toEqual([]);
  });

  it("нулевое перемещение ничего не меняет", () => {
    const state = initialWheelState();
    expect(wheelStep(state, 0, 10)).toEqual({ state, step: 0 });
  });
});
