import { describe, expect, it } from "vitest";
import { laysOnSide } from "@/lib/artifactBox";

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
