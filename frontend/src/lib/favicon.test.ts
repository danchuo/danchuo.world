import { describe, expect, it } from "vitest";
import { FAVICON_SPRITES, faviconFrameAt, faviconLoopMs, resolveFavicon } from "./favicon";

describe("resolveFavicon", () => {
  it("отдаёт вращающуюся землю по умолчанию — волн без своей иконки не бывает", () => {
    expect(resolveFavicon(null).src).toBe("/assets/favicon/earth-spin.png");
    expect(resolveFavicon(undefined).src).toBe("/assets/favicon/earth-spin.png");
    expect(resolveFavicon("wave-01").src).toBe("/assets/favicon/earth-spin.png");
  });

  it("волна со своей иконкой перебивает дефолт", () => {
    expect(resolveFavicon("wave-02").src).toBe("/assets/favicon/earth-pixel.png");
  });

  it("незнакомая/будущая волна тихо падает на дефолт, а не ломает вкладку", () => {
    expect(resolveFavicon("wave-99")).toEqual(resolveFavicon(null));
    expect(resolveFavicon("")).toEqual(resolveFavicon(null));
  });

  it("каждый спрайт описан целиком: кадры, размер клетки, шаг", () => {
    for (const spec of Object.values(FAVICON_SPRITES)) {
      expect(spec.frames).toBeGreaterThan(0);
      expect(spec.cell).toBeGreaterThan(0);
      expect(spec.frameMs).toBeGreaterThan(0);
      expect(spec.src.startsWith("/assets/favicon/")).toBe(true);
    }
  });
});

describe("faviconFrameAt", () => {
  const spec = { src: "/x.png", frames: 4, cell: 32, frameMs: 100 };

  it("ведёт кадр по прошедшему времени, а не по счётчику тиков", () => {
    expect(faviconFrameAt(0, spec)).toBe(0);
    expect(faviconFrameAt(99, spec)).toBe(0);
    expect(faviconFrameAt(100, spec)).toBe(1);
    expect(faviconFrameAt(350, spec)).toBe(3);
  });

  it("зацикливается: пропущенное в фоне время не выкидывает за спрайт", () => {
    expect(faviconFrameAt(400, spec)).toBe(0);
    expect(faviconFrameAt(60_000, spec)).toBe(0);
    expect(faviconFrameAt(60_150, spec)).toBe(1);
  });

  it("отрицательное/нечисловое время не даёт вылезти за границы спрайта", () => {
    expect(faviconFrameAt(-100, spec)).toBe(0);
    expect(faviconFrameAt(Number.NaN, spec)).toBe(0);
  });

  it("длина петли — кадры на шаг", () => {
    expect(faviconLoopMs(spec)).toBe(400);
  });
});
