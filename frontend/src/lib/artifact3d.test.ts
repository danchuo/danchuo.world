import { describe, expect, it } from "vitest";
import { createFrameClock, fitDistance, is3dArtifact, nextSpin, rewindSpin } from "./artifact3d";

describe("is3dArtifact", () => {
  it("узнаёт glTF по расширению, включая регистр и хвост запроса", () => {
    expect(is3dArtifact("/assets/3d/wireframe-globe.glb")).toBe(true);
    expect(is3dArtifact("/assets/3d/wireframe-globe.GLB?v=2")).toBe(true);
    expect(is3dArtifact("/assets/3d/scene.gltf")).toBe(true);
  });

  it("не путает 3D с картинками и пустотой", () => {
    expect(is3dArtifact("/assets/projects/danchuo-world-px.png")).toBe(false);
    expect(is3dArtifact("https://example.com/favicon.ico")).toBe(false);
    expect(is3dArtifact("")).toBe(false);
  });

  it("не ловит подстроку в середине пути", () => {
    expect(is3dArtifact("/assets/glb/planet.png")).toBe(false);
  });
});

describe("fitDistance", () => {
  it("ставит камеру так, что шар радиуса r вписан в вертикальный угол обзора", () => {
    // At a 60° fov the half-angle is 30°, sin 0.5 ⇒ the distance is twice the radius.
    expect(fitDistance(1, 60, 1)).toBeCloseTo(2, 6);
    expect(fitDistance(2, 60, 1)).toBeCloseTo(4, 6);
  });

  it("отодвигает камеру на поле вокруг предмета", () => {
    expect(fitDistance(1, 60, 1.25)).toBeCloseTo(2.5, 6);
  });

  it("не делит на ноль на вырожденном предмете", () => {
    expect(fitDistance(0, 60, 1.25)).toBeGreaterThan(0);
  });
});

describe("nextSpin", () => {
  /** Plays [ms] milliseconds as 16ms frames, the way rAF delivers them. */
  const play = (ms: number, rpm: number) => {
    let angle = 0;
    for (let t = 0; t < ms; t += 16) angle = nextSpin(angle, 16, rpm);
    return angle;
  };

  it("за полминуты при 1 об/мин проходит половину круга", () => {
    expect(play(30_000, 1)).toBeCloseTo(Math.PI, 3);
  });

  it("держит угол в пределах круга, сколько бы кадров ни прошло", () => {
    const a = play(10 * 60_000 + 15_000, 1);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(2 * Math.PI);
    expect(a).toBeCloseTo(Math.PI / 2, 2);
  });

  it("кадр-выброс (вкладку увели и вернули) не проматывает предмет рывком", () => {
    // A five-minute pause must not be paid back in a jump: the step is capped per frame.
    expect(nextSpin(0, 300_000, 6)).toBeCloseTo(nextSpin(0, 100, 6), 6);
  });
});

describe("createFrameClock", () => {
  it("первый кадр захода не двигает предмет", () => {
    expect(createFrameClock().step(1000)).toBe(0);
  });

  it("дальше отдаёт настоящий шаг между кадрами", () => {
    const clock = createFrameClock();
    clock.step(1000);
    expect(clock.step(1016)).toBe(16);
    expect(clock.step(1032)).toBe(16);
  });

  it("⚠️ регрессия: продолжение цикла не обнуляет отсчёт", () => {
    // This is what happened: `tick` continued the loop through the same function that starts it,
    // and that reset the count. The step came out zero every frame and the item looked still.
    // Resetting is possible only through `reset`, that is at the END of a cycle.
    const clock = createFrameClock();
    clock.step(1000);
    for (let i = 1; i <= 5; i++) expect(clock.step(1000 + i * 16)).toBe(16);
  });

  it("остановленный цикл начинает следующий заход с нуля", () => {
    const clock = createFrameClock();
    clock.step(1000);
    clock.reset();
    // The cursor left and came back a minute and a half later — the pause is not paid in a jump.
    expect(clock.step(90_000)).toBe(0);
  });
});

describe("rewindSpin", () => {
  const TURN = 2 * Math.PI;

  it("отматывает назад с той же скоростью, что крутил вперёд", () => {
    // A second forward and a second back at one speed return the item to exactly where it was.
    const forward = nextSpin(0, 100, 6);
    expect(rewindSpin(forward, 100, 6)).toBeCloseTo(0, 9);
  });

  it("круг с хвостом отматывается ТОЛЬКО хвостом", () => {
    // The item turned 1.1 revolutions: back it must travel 0.1, not 1.1 — whole turns are
    // indistinguishable in its pose, and rewinding them would spin it for nothing.
    const spun = 1.1 * TURN % TURN; // exactly what the angle stores: the fractional part
    expect(spun).toBeCloseTo(0.1 * TURN, 9);
    // In the time enough for 0.1 of a turn it reaches the start (to floating-point precision —
    // the accumulated epsilon costs at most one extra frame).
    expect(rewindSpin(spun, 100, 60)).toBeCloseTo(0, 12);
  });

  it("доходит до начального положения и там останавливается намертво", () => {
    expect(rewindSpin(0.02, 100, 60)).toBe(0);
    expect(rewindSpin(0, 100, 60)).toBe(0);
    // It does not fall below zero: back means UP TO the start, not past it.
    expect(rewindSpin(0.001, 5000, 60)).toBe(0);
  });

  it("кадр-выброс не отматывает рывком — тот же потолок шага, что у вращения", () => {
    expect(rewindSpin(TURN * 0.9, 300_000, 6)).toBeCloseTo(rewindSpin(TURN * 0.9, 100, 6), 9);
  });

  it("отмотка кадр за кадром приводит ровно в начало и занимает столько же, сколько вращение", () => {
    let angle = 0;
    for (let i = 0; i < 40; i++) angle = nextSpin(angle, 16, 9);
    let back = angle;
    let frames = 0;
    while (back > 0 && frames < 200) {
      back = rewindSpin(back, 16, 9);
      frames++;
    }
    // The stop is hard: the item arrives AT zero, not "near zero".
    expect(back).toBe(0);
    // As many frames as it spun, plus at most one to make up the epsilon.
    expect(frames).toBeGreaterThanOrEqual(40);
    expect(frames).toBeLessThanOrEqual(41);
  });
});
