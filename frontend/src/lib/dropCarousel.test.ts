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

describe("dropCarousel — вид кадра как функция позиции", () => {
  it("в середине окна кадр в полный рост и непрозрачен", () => {
    const look = slotLook(0, R);
    expect(look.scale).toBeCloseTo(1, 5);
    expect(look.opacity).toBeCloseTo(1, 5);
  });

  it("за радиусом кадр упирается в пол и ниже не падает", () => {
    const edge = slotLook(R, R);
    const far = slotLook(R * 4, R);
    expect(edge.scale).toBeCloseTo(CAROUSEL_FAR_SCALE, 5);
    expect(edge.opacity).toBeCloseTo(CAROUSEL_FAR_OPACITY, 5);
    // Дальний кадр не темнее и не мельче краевого: пол один, за радиусом спад кончился.
    expect(far.scale).toBeCloseTo(CAROUSEL_FAR_SCALE, 5);
    expect(far.opacity).toBeCloseTo(CAROUSEL_FAR_OPACITY, 5);
  });

  it("спад монотонный: чем ближе к середине, тем крупнее и ярче", () => {
    const steps = [0, 20, 40, 60, 80, 100, 120].map((d) => slotLook(d, R));
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i].scale).toBeLessThan(steps[i - 1].scale);
      expect(steps[i].opacity).toBeLessThan(steps[i - 1].opacity);
    }
  });

  it("сторона не важна: кадр выше и ниже середины выглядит одинаково", () => {
    expect(slotLook(-70, R)).toEqual(slotLook(70, R));
  });

  it("расфокус начинается СО ВТОРОГО соседа: центр и ближние кадры резкие", () => {
    const pitch = CAROUSEL_SHARP_PX; // шаг ленты: слот + просвет
    // Выбранный кадр и оба его соседа (второй и третий кадр окна) — резкие.
    expect(slotLook(0, R).blur).toBeCloseTo(0, 5);
    expect(slotLook(pitch, R).blur).toBeCloseTo(0, 5);
    expect(slotLook(-pitch, R).blur).toBeCloseTo(0, 5);
    // Следующее кольцо (четвёртый и пятый кадр окна) — уже в полном расфокусе.
    expect(slotLook(pitch * 2, R).blur).toBeCloseTo(CAROUSEL_FAR_BLUR_PX, 5);
    expect(slotLook(pitch * 4, R).blur).toBeCloseTo(CAROUSEL_FAR_BLUR_PX, 5);
    // Между кольцами расфокус нарастает, а не включается ступенькой.
    const between = slotLook(pitch * 1.5, R).blur;
    expect(between).toBeGreaterThan(0);
    expect(between).toBeLessThan(CAROUSEL_FAR_BLUR_PX);
  });

  it("ближний кадр перекрывает дальний", () => {
    expect(slotLook(0, R).zIndex).toBeGreaterThan(slotLook(R, R).zIndex);
  });

  it("вырожденное окно не роняет ленту в NaN", () => {
    const look = slotLook(50, 0);
    expect(look.scale).toBeCloseTo(CAROUSEL_FAR_SCALE, 5);
    expect(Number.isFinite(look.opacity)).toBe(true);
    expect(Number.isFinite(look.zIndex)).toBe(true);
  });

  it("высота слота — константа: лента читается одинаково и на трёх дропах, и на трёхстах", () => {
    expect(CAROUSEL_SLOT_PX).toBeGreaterThan(0);
  });
});

describe("startSlotIndex", () => {
  it("лента открывается на ВТОРОМ дропе: сверху и снизу видно по соседу", () => {
    expect(startSlotIndex(8)).toBe(1);
    expect(startSlotIndex(3)).toBe(1);
  });

  it("дроп один — центрировать больше нечего", () => {
    expect(startSlotIndex(1)).toBe(0);
    expect(startSlotIndex(0)).toBe(0);
  });
});
