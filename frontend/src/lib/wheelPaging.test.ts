import { describe, expect, it } from "vitest";
import {
  WHEEL_IDLE_MS,
  WHEEL_LOCK_MS,
  WHEEL_MIN_STEP_GAP_MS,
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
    // Firefox отдаёт колесо строками (3 за щелчок): без перевода три «пикселя» шага не дали бы.
    expect(Math.abs(wheelTravel(0, 3, 1))).toBeGreaterThanOrEqual(WHEEL_STEP_PX);
    expect(Math.abs(wheelTravel(0, 1, 2))).toBeGreaterThanOrEqual(WHEEL_STEP_PX);
  });
});

describe("wheelStep — щелчок мыши и жест тачпада дают по одному шагу", () => {
  it("щелчок колеса мыши (100px) — сразу один шаг", () => {
    expect(run([[100, 0]]).steps).toEqual([1]);
    expect(run([[-100, 0]]).steps).toEqual([-1]);
  });

  it("мелкие дельты тачпада копятся и дают шаг, только перейдя порог", () => {
    const { steps } = run([
      [-20, 0],
      [-20, 16],
      [-20, 32],
    ]);
    expect(steps).toEqual([-1]);
  });

  it("инерция после шага глотается: пока события идут подряд, второго шага нет", () => {
    // Тачпад после жеста досылает затухающий хвост ещё сотни миллисекунд.
    const tail: Array<[number, number]> = [];
    for (let t = 16; t < 900; t += 16) tail.push([-30, t]);
    expect(run([[-100, 0], ...tail]).steps).toEqual([-1]);
  });

  it("быстрое вращение колеса мыши листает не один раз за очередь: щелчки идут сквозь блокировку", () => {
    // Четыре щелчка по 100px через 50мс — шаги не слипаются ближе минимального зазора, но и не
    // глотаются до тишины (так календарь «крутился туго»).
    const { steps } = run([
      [-100, 0],
      [-100, 50],
      [-100, 100],
      [-100, 150],
    ]);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.every((s) => s === -1)).toBe(true);
  });

  it("два щелчка ближе минимального зазора сливаются в один шаг", () => {
    expect(run([[-100, 0], [-100, WHEEL_MIN_STEP_GAP_MS - 1]]).steps).toEqual([-1]);
  });

  it("ровное движение двумя пальцами после шага продолжает листать, а не ждёт тишины", () => {
    // После первого шага дельты не убывают (дрожат вокруг 14px): это не хвост инерции,
    // а живое движение — оно обязано копиться и давать следующие шаги.
    const events: Array<[number, number]> = [[-100, 0]];
    const jitter = [12, 16, 11, 18, 13, 17, 12, 19, 14, 20];
    for (let i = 0; i < 40; i++) events.push([-jitter[i % jitter.length], 16 * (i + 1)]);
    const { steps } = run(events);
    expect(steps.length).toBeGreaterThanOrEqual(3);
  });

  it("после паузы длиннее блокировки следующий жест листает снова", () => {
    expect(run([[-100, 0], [-100, WHEEL_LOCK_MS + 1]]).steps).toEqual([-1, -1]);
  });

  it("накопленное сбрасывается после простоя: два ленивых касания с перерывом не складываются", () => {
    const { steps } = run([
      [-30, 0],
      [-30, WHEEL_IDLE_MS + 1],
    ]);
    expect(steps).toEqual([]);
  });

  it("смена направления не наследует накопленное чужого знака", () => {
    const { steps } = run([
      [-30, 0],
      [30, 16],
      [30, 32],
    ]);
    expect(steps).toEqual([1]);
  });

  it("нулевое перемещение ничего не меняет", () => {
    const state = initialWheelState();
    expect(wheelStep(state, 0, 10)).toEqual({ state, step: 0 });
  });
});
