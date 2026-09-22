import { describe, expect, it } from "vitest";
import { FAVICON_SPRITES, faviconFrameAt, faviconLoopMs, resolveFavicon } from "./favicon";

describe("resolveFavicon", () => {
  it("returns the spinning earth by default — there are no waves without their own icon", () => {
    expect(resolveFavicon(null).src).toBe("/assets/favicon/earth-spin.png");
    expect(resolveFavicon(undefined).src).toBe("/assets/favicon/earth-spin.png");
    expect(resolveFavicon("wave-01").src).toBe("/assets/favicon/earth-spin.png");
  });

  it("a wave with its own icon overrides the default", () => {
    expect(resolveFavicon("wave-02").src).toBe("/assets/favicon/earth-pixel.png");
  });

  it("an unknown/future wave quietly falls back to the default instead of breaking the tab", () => {
    expect(resolveFavicon("wave-99")).toEqual(resolveFavicon(null));
    expect(resolveFavicon("")).toEqual(resolveFavicon(null));
  });

  it("each sprite is described in full: frames, cell size, step", () => {
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

  it("drives the frame by elapsed time, not by a tick counter", () => {
    expect(faviconFrameAt(0, spec)).toBe(0);
    expect(faviconFrameAt(99, spec)).toBe(0);
    expect(faviconFrameAt(100, spec)).toBe(1);
    expect(faviconFrameAt(350, spec)).toBe(3);
  });

  it("loops: time missed in the background does not throw past the sprite", () => {
    expect(faviconFrameAt(400, spec)).toBe(0);
    expect(faviconFrameAt(60_000, spec)).toBe(0);
    expect(faviconFrameAt(60_150, spec)).toBe(1);
  });

  it("negative/non-numeric time cannot go past the sprite bounds", () => {
    expect(faviconFrameAt(-100, spec)).toBe(0);
    expect(faviconFrameAt(Number.NaN, spec)).toBe(0);
  });

  it("loop length is frames per step", () => {
    expect(faviconLoopMs(spec)).toBe(400);
  });
});
