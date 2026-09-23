import { describe, expect, it } from "vitest";
import { photoFrame } from "./dayPhoto";

describe("photoFrame", () => {
  it("a portrait stands as tall as the monster's square and narrower", () => {
    const f = photoFrame(1600, 2400);
    expect(f.height).toBe(1);
    expect(f.width).toBeCloseTo(2 / 3);
  });

  it("a landscape stands as tall as the slot too and widens by its ratio", () => {
    const f = photoFrame(2400, 1600);
    expect(f.height).toBe(1);
    expect(f.width).toBeCloseTo(1.5);
  });

  it("a square is the square", () => {
    expect(photoFrame(1000, 1000)).toEqual({ width: 1, height: 1 });
  });

  it("a panorama stops at two slots wide and only gets lower", () => {
    const f = photoFrame(4000, 1000);
    expect(f.width).toBeCloseTo(2);
    expect(f.width / f.height).toBeCloseTo(4);
  });

  it("a broken size falls back to the square", () => {
    expect(photoFrame(0, 0)).toEqual({ width: 1, height: 1 });
  });
});
