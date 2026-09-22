import { describe, expect, it } from "vitest";
import { createFrameClock, fitDistance, is3dArtifact, nextSpin, rewindSpin, wrapAngle } from "./artifact3d";

describe("is3dArtifact", () => {
  it("recognises glTF by extension, including case and a query tail", () => {
    expect(is3dArtifact("/assets/3d/wireframe-globe.glb")).toBe(true);
    expect(is3dArtifact("/assets/3d/wireframe-globe.GLB?v=2")).toBe(true);
    expect(is3dArtifact("/assets/3d/scene.gltf")).toBe(true);
  });

  it("does not confuse 3D with pictures and emptiness", () => {
    expect(is3dArtifact("/assets/projects/danchuo-world-px.png")).toBe(false);
    expect(is3dArtifact("https://example.com/favicon.ico")).toBe(false);
    expect(is3dArtifact("")).toBe(false);
  });

  it("does not catch a substring in the middle of the path", () => {
    expect(is3dArtifact("/assets/glb/planet.png")).toBe(false);
  });
});

describe("fitDistance", () => {
  it("places the camera so a sphere of radius r fits the vertical field of view", () => {
    // At a 60° fov the half-angle is 30°, sin 0.5 ⇒ the distance is twice the radius.
    expect(fitDistance(1, 60, 1)).toBeCloseTo(2, 6);
    expect(fitDistance(2, 60, 1)).toBeCloseTo(4, 6);
  });

  it("moves the camera back by a margin around the item", () => {
    expect(fitDistance(1, 60, 1.25)).toBeCloseTo(2.5, 6);
  });

  it("does not divide by zero on a degenerate item", () => {
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

  it("in half a minute at 1 rpm it covers half a turn", () => {
    expect(play(30_000, 1)).toBeCloseTo(Math.PI, 3);
  });

  it("keeps the angle within a circle however many frames pass", () => {
    const a = play(10 * 60_000 + 15_000, 1);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(2 * Math.PI);
    expect(a).toBeCloseTo(Math.PI / 2, 2);
  });

  it("an outlier frame (tab left and returned) does not spin the item with a jerk", () => {
    // A five-minute pause must not be paid back in a jump: the step is capped per frame.
    expect(nextSpin(0, 300_000, 6)).toBeCloseTo(nextSpin(0, 100, 6), 6);
  });
});

describe("createFrameClock", () => {
  it("the first frame of an entry does not move the item", () => {
    expect(createFrameClock().step(1000)).toBe(0);
  });

  it("after that it returns the real step between frames", () => {
    const clock = createFrameClock();
    clock.step(1000);
    expect(clock.step(1016)).toBe(16);
    expect(clock.step(1032)).toBe(16);
  });

  it("⚠️ regression: continuing a cycle does not reset the count", () => {
    // This is what happened: `tick` continued the loop through the same function that starts it,
    // and that reset the count. The step came out zero every frame and the item looked still.
    // Resetting is possible only through `reset`, that is at the END of a cycle.
    const clock = createFrameClock();
    clock.step(1000);
    for (let i = 1; i <= 5; i++) expect(clock.step(1000 + i * 16)).toBe(16);
  });

  it("a stopped cycle starts the next session from zero", () => {
    const clock = createFrameClock();
    clock.step(1000);
    clock.reset();
    // The cursor left and came back a minute and a half later — the pause is not paid in a jump.
    expect(clock.step(90_000)).toBe(0);
  });
});

describe("rewindSpin", () => {
  const TURN = 2 * Math.PI;

  it("rewinds at the same speed it turned forward", () => {
    // A second forward and a second back at one speed return the item to exactly where it was.
    const forward = nextSpin(0, 100, 6);
    expect(rewindSpin(forward, 100, 6)).toBeCloseTo(0, 9);
  });

  it("a turn with a tail is rewound ONLY by the tail", () => {
    // The item turned 1.1 revolutions: back it must travel 0.1, not 1.1 — whole turns are
    // indistinguishable in its pose, and rewinding them would spin it for nothing.
    const spun = 1.1 * TURN % TURN; // exactly what the angle stores: the fractional part
    expect(spun).toBeCloseTo(0.1 * TURN, 9);
    // In the time enough for 0.1 of a turn it reaches the start (to floating-point precision —
    // the accumulated epsilon costs at most one extra frame).
    expect(rewindSpin(spun, 100, 60)).toBeCloseTo(0, 12);
  });

  it("reaches its starting position and stops dead there", () => {
    expect(rewindSpin(0.02, 100, 60)).toBe(0);
    expect(rewindSpin(0, 100, 60)).toBe(0);
    // It does not fall below zero: back means UP TO the start, not past it.
    expect(rewindSpin(0.001, 5000, 60)).toBe(0);
  });

  it("an outlier frame does not rewind with a jerk — the same step ceiling as the rotation", () => {
    expect(rewindSpin(TURN * 0.9, 300_000, 6)).toBeCloseTo(rewindSpin(TURN * 0.9, 100, 6), 9);
  });

  it("rewinding frame by frame returns exactly to the start and takes as long as the rotation", () => {
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

describe("wrapAngle", () => {
  it("keeps an angle inside one turn", () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(wrapAngle(2 * Math.PI + 0.5)).toBeCloseTo(0.5, 10);
  });

  it("brings a backward turn round to the positive side", () => {
    expect(wrapAngle(-0.5)).toBeCloseTo(2 * Math.PI - 0.5, 10);
  });

  it("drops whole turns, which the pose cannot show anyway", () => {
    expect(wrapAngle(10 * Math.PI)).toBeCloseTo(0, 10);
  });
});
