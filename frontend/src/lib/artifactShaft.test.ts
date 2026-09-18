import { describe, expect, it } from "vitest";
import type { ArtifactView } from "./api/types";
import {
  SHAFT_DEPTH,
  SHAFT_FAR_BLUR_PX,
  SHAFT_FAR_DIM,
  SHAFT_LEAD,
  shaftArtifacts,
  shaftLook,
  shaftWindow,
  stepShaft,
} from "./artifactShaft";

describe("shaftLook", () => {
  it("puts the front slot at full size, sharp and unlifted", () => {
    expect(shaftLook(0)).toMatchObject({ scale: 1, opacity: 1, blur: 0, rise: 0, drift: 0 });
  });

  it("drifts sideways with depth, so identical objects do not hide one another", () => {
    expect(shaftLook(2)!.drift).toBeGreaterThan(shaftLook(1)!.drift);
  });

  it("shrinks, dims and blurs with depth", () => {
    const near = shaftLook(1)!;
    const far = shaftLook(SHAFT_DEPTH)!;
    expect(far.scale).toBeLessThan(near.scale);
    expect(far.opacity).toBeLessThan(near.opacity);
    expect(far.blur).toBeGreaterThan(near.blur);
    expect(far.rise).toBeGreaterThan(near.rise);
  });

  it("keeps the far end visible rather than transparent, and caps the blur", () => {
    const far = shaftLook(SHAFT_DEPTH)!;
    expect(far.opacity).toBeCloseTo(SHAFT_FAR_DIM, 5);
    expect(far.blur).toBeLessThanOrEqual(SHAFT_FAR_BLUR_PX);
  });

  it("keeps the front slot and its neighbour sharp", () => {
    expect(shaftLook(0.5)!.blur).toBe(0);
  });

  it("grows and fades an object leaving towards the viewer", () => {
    const leaving = shaftLook(-SHAFT_LEAD / 2)!;
    expect(leaving.scale).toBeGreaterThan(1);
    expect(leaving.opacity).toBeLessThan(1);
  });

  it("covers further objects with nearer ones", () => {
    expect(shaftLook(0)!.zIndex).toBeGreaterThan(shaftLook(1)!.zIndex);
  });

  it("drops out of the shaft past either end", () => {
    expect(shaftLook(SHAFT_DEPTH + 0.01)).toBeNull();
    expect(shaftLook(-SHAFT_LEAD - 0.01)).toBeNull();
  });
});

describe("stepShaft", () => {
  it("moves by whole artifacts", () => {
    expect(stepShaft(0, 1, 5)).toBe(1);
    expect(stepShaft(2.4, -1, 5)).toBe(1);
  });

  it("stops at both ends instead of wrapping", () => {
    expect(stepShaft(0, -1, 5)).toBe(0);
    expect(stepShaft(4, 1, 5)).toBe(4);
  });

  it("answers zero for an empty collection", () => {
    expect(stepShaft(0, 1, 0)).toBe(0);
  });
});

describe("shaftWindow", () => {
  it("mounts a fixed handful however long the collection is", () => {
    expect(shaftWindow(0, 100).length).toBe(shaftWindow(0, 30).length);
  });

  it("loads the front object before the depth behind it", () => {
    expect(shaftWindow(4, 20)[0]).toBe(4);
  });

  it("holds nothing for an empty collection", () => {
    expect(shaftWindow(0, 0)).toEqual([]);
  });
});

describe("shaftArtifacts", () => {
  const item = (name: string, model3dUrl: string | null) =>
    ({ id: 1, name, imageUrl: null, firstMentionedOn: "2026-01-01", model3dUrl }) as ArtifactView;

  it("в шахту попадают только предметы со своей моделью", () => {
    const shown = shaftArtifacts([item("с моделью", "/m.glb"), item("без", null)]);
    expect(shown.map((a) => a.name)).toEqual(["с моделью"]);
  });

  it("ни у кого нет модели — шахте нечего показывать", () => {
    expect(shaftArtifacts([item("без", null), item("и этот", "")])).toEqual([]);
  });
});
