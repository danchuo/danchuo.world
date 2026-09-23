import { describe, expect, it } from "vitest";
import { artifactBox, laysOnSide } from "@/lib/artifactBox";

/**
 * The "may this item lie on its side" predicate, the one the marquee lives by (DESIGN §7.2) but
 * lifted out: the item card beside a finding's box (§7.5) needs exactly this and not the
 * marquee's sizing.
 */
describe("laysOnSide — the flag allows it, geometry decides", () => {
  const RACKET = 619 / 2055; // tall: the production racket after trimming its margins
  const GLASSES = 2.82; // wide
  const CAMERA = 1191 / 853; // a nearly square point-and-shoot

  it("an item elongated vertically lies on its side in a horizontal slot", () => {
    expect(laysOnSide(RACKET, true, false)).toBe(true);
  });

  it("without permission the item never rotates", () => {
    // The main invariant: sunglasses and a camera have a right way up.
    expect(laysOnSide(RACKET, false, false)).toBe(false);
    expect(laysOnSide(GLASSES, false, true)).toBe(false);
  });

  it("an item already lying along the slot is not flipped", () => {
    expect(laysOnSide(GLASSES, true, false)).toBe(false);
    expect(laysOnSide(RACKET, true, true)).toBe(false);
  });

  it("a non-elongated item does not rotate even when allowed", () => {
    expect(laysOnSide(CAMERA, true, false)).toBe(false);
    expect(laysOnSide(CAMERA, true, true)).toBe(false);
  });

  it("an unmeasured picture counts as square — no rotation", () => {
    // Before onLoad the ratio is zero: rotating "just in case" would show the item on its side.
    expect(laysOnSide(0, true, false)).toBe(false);
    expect(laysOnSide(Number.NaN, true, false)).toBe(false);
  });
});

// Proportions of the real items in the ribbon (w/h of the PNGs themselves).
const GLASSES = 922 / 318; // 2.90 — wide across themselves, they "lie"
const RACKET = 330 / 1257; // 0.26 — long along itself, it "stands"
const CAMERA = 1262 / 829; // 1.52 — nearly square

/** An item's optical weight: the side of a square with the same area. */
const presence = (b: { width: number; height: number }) => Math.sqrt(b.width * b.height);

describe("artifactBox — sideways only when allowed, shared weight", () => {
  it("the racket is allowed to lie down ⇒ in the horizontal ribbon it lies along", () => {
    const racket = artifactBox(RACKET, false, true);

    expect(racket.rotate).toBe(true);
    // The long side lies along the ribbon (otherwise the racket would be an 11px thread).
    expect(racket.width).toBeGreaterThan(racket.height);
  });

  it("the glasses are NOT allowed to lie down ⇒ in wave 02's vertical ribbon they do not go on their side", () => {
    // The rule is not geometric: sunglasses have a right way up, a racket does not. That cannot
    // be derived from a proportion, so the permission is stored on the item itself.
    const box = artifactBox(GLASSES, true, false);
    expect(box.rotate).toBe(false);
    expect(box.width / box.height).toBeCloseTo(GLASSES, 2);
  });

  it("permission alone does not rotate: the item already lies along the ribbon", () => {
    expect(artifactBox(RACKET, true, true).rotate).toBe(false); // vertical ribbon
    expect(artifactBox(GLASSES, false, true).rotate).toBe(false); // horizontal
  });

  it("an almost square item is not rotated even when allowed — there is nothing to rotate", () => {
    expect(artifactBox(CAMERA, false, true).rotate).toBe(false);
    expect(artifactBox(CAMERA, true, true).rotate).toBe(false);
  });

  it("by default items may not lie down — a new item stays as drawn", () => {
    expect(artifactBox(RACKET, false).rotate).toBe(false);
    expect(artifactBox(GLASSES, true).rotate).toBe(false);
  });

  it("items weigh the same: equal area, not equal height", () => {
    // Matching by height is wrong: wide sunglasses at the same height take twice the room of a
    // near-square camera and read larger. We match optical weight.
    const boxes = [
      artifactBox(GLASSES, false, false),
      artifactBox(RACKET, false, true),
      artifactBox(CAMERA, false, false),
    ];
    for (const box of boxes) expect(presence(box)).toBeCloseTo(presence(boxes[0]), 1);
  });

  it("the weight does not stick out of the ribbon: the cross size stays within the ceiling", () => {
    for (const ratio of [GLASSES, RACKET, CAMERA]) {
      for (const rotatable of [false, true]) {
        expect(artifactBox(ratio, false, rotatable).height).toBeLessThanOrEqual(40);
        expect(artifactBox(ratio, true, rotatable).width).toBeLessThanOrEqual(40);
      }
    }
  });

  it("the proportion is always kept — the item is not squashed", () => {
    for (const [ratio, vertical, rotatable] of [
      [GLASSES, false, false], [GLASSES, true, false], [GLASSES, true, true],
      [RACKET, false, true], [RACKET, false, false], [RACKET, true, true],
      [CAMERA, false, false], [CAMERA, true, true],
    ] as const) {
      const box = artifactBox(ratio, vertical, rotatable);
      const onScreen = box.rotate ? 1 / ratio : ratio;
      expect(box.width / box.height).toBeCloseTo(onScreen, 2);
    }
  });

  it("a broken proportion (the picture was not measured) → a square at the cross ceiling, no NaN", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const box = artifactBox(bad, false, true);
      expect(box.rotate).toBe(false);
      expect(box.width).toBe(40);
      expect(box.height).toBe(40);
    }
  });
});
