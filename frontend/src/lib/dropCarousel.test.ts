import { describe, expect, it } from "vitest";
import {
  CAROUSEL_FAR_OPACITY,
  CAROUSEL_FAR_SCALE,
  CAROUSEL_SLOT_PX,
  CAROUSEL_FAR_BLUR_PX,
  CAROUSEL_SHARP_PX,
  slotLook,
  startSlotIndex,
} from "./dropCarousel";

const R = 120;

describe("dropCarousel — a frame's look as a function of position", () => {
  it("in the middle of the window a frame is full size and opaque", () => {
    const look = slotLook(0, R);
    expect(look.scale).toBeCloseTo(1, 5);
    expect(look.opacity).toBeCloseTo(1, 5);
  });

  it("beyond the radius the frame hits the floor and falls no lower", () => {
    const edge = slotLook(R, R);
    const far = slotLook(R * 4, R);
    expect(edge.scale).toBeCloseTo(CAROUSEL_FAR_SCALE, 5);
    expect(edge.opacity).toBeCloseTo(CAROUSEL_FAR_OPACITY, 5);
    // A far frame is no darker or smaller than an edge one: one floor, the falloff ends at the radius.
    expect(far.scale).toBeCloseTo(CAROUSEL_FAR_SCALE, 5);
    expect(far.opacity).toBeCloseTo(CAROUSEL_FAR_OPACITY, 5);
  });

  it("the falloff is monotonic: the closer to the middle, the larger and brighter", () => {
    const steps = [0, 20, 40, 60, 80, 100, 120].map((d) => slotLook(d, R));
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i].scale).toBeLessThan(steps[i - 1].scale);
      expect(steps[i].opacity).toBeLessThan(steps[i - 1].opacity);
    }
  });

  it("the side does not matter: a frame above and below the middle looks the same", () => {
    expect(slotLook(-70, R)).toEqual(slotLook(70, R));
  });

  it("the defocus starts FROM THE SECOND neighbour: the centre and near frames are sharp", () => {
    const pitch = CAROUSEL_SHARP_PX; // the ribbon's step: a slot plus the gap
    // The selected frame and both its neighbours are sharp.
    expect(slotLook(0, R).blur).toBeCloseTo(0, 5);
    expect(slotLook(pitch, R).blur).toBeCloseTo(0, 5);
    expect(slotLook(-pitch, R).blur).toBeCloseTo(0, 5);
    // The next ring is already fully out of focus.
    expect(slotLook(pitch * 2, R).blur).toBeCloseTo(CAROUSEL_FAR_BLUR_PX, 5);
    expect(slotLook(pitch * 4, R).blur).toBeCloseTo(CAROUSEL_FAR_BLUR_PX, 5);
    // Between rings the defocus grows rather than switching on as a step.
    const between = slotLook(pitch * 1.5, R).blur;
    expect(between).toBeGreaterThan(0);
    expect(between).toBeLessThan(CAROUSEL_FAR_BLUR_PX);
  });

  it("the near frame covers the far one", () => {
    expect(slotLook(0, R).zIndex).toBeGreaterThan(slotLook(R, R).zIndex);
  });

  it("a degenerate window does not drop the ribbon into NaN", () => {
    const look = slotLook(50, 0);
    expect(look.scale).toBeCloseTo(CAROUSEL_FAR_SCALE, 5);
    expect(Number.isFinite(look.opacity)).toBe(true);
    expect(Number.isFinite(look.zIndex)).toBe(true);
  });

  it("the slot height is a constant: the ribbon reads the same with three drops and with three hundred", () => {
    expect(CAROUSEL_SLOT_PX).toBeGreaterThan(0);
  });
});

describe("startSlotIndex", () => {
  it("the ribbon opens on the SECOND drop: a neighbour is visible above and below", () => {
    expect(startSlotIndex(8)).toBe(1);
    expect(startSlotIndex(3)).toBe(1);
  });

  it("one drop — there is nothing more to centre", () => {
    expect(startSlotIndex(1)).toBe(0);
    expect(startSlotIndex(0)).toBe(0);
  });
});
