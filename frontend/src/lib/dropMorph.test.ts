import { describe, expect, it } from "vitest";
import { cssDurationMs, morphClip, morphRadius, morphTransform } from "./dropMorph";

describe("morphClip", () => {
  it("crops the frame along the short axis — exactly what did not fit in the tile", () => {
    // A 100×100 tile and a 400×200 hero: scale 0.5, so a 200×200 piece fits the tile and
    // (400 − 200) / 2 = 100 must be trimmed from each side by width.
    const from = { left: 0, top: 0, width: 100, height: 100 };
    const to = { left: 0, top: 0, width: 400, height: 200 };
    expect(morphClip(from, to, 0)).toBe("inset(0px 100px)");
  });

  it("nothing is clipped along the axis the scale was chosen by", () => {
    const from = { left: 0, top: 0, width: 200, height: 100 };
    const to = { left: 0, top: 0, width: 400, height: 200 };
    // The proportions match ⇒ the frame sits in the tile exactly, with nothing to trim.
    expect(morphClip(from, to, 0)).toBe("inset(0px 0px)");
  });

  it("the rounding goes into the clip divided by the scale", () => {
    const from = { left: 0, top: 0, width: 100, height: 100 };
    const to = { left: 0, top: 0, width: 400, height: 200 };
    expect(morphClip(from, to, 6)).toBe("inset(0px 100px round 12px)");
  });

  it("returns null on degenerate boxes — just like the transform", () => {
    expect(morphClip({ left: 0, top: 0, width: 0, height: 10 }, { left: 0, top: 0, width: 10, height: 10 }, 4)).toBeNull();
  });
});

describe("morphTransform", () => {
  it("places the hero exactly in the tile's bounds: centre to centre, size to size", () => {
    // A 300×200 tile in the screen's left half, a 900×600 hero in the centre.
    const from = { left: 100, top: 200, width: 300, height: 200 };
    const to = { left: 500, top: 100, width: 900, height: 600 };
    // Centres: the tile (250, 300), the hero (950, 400) ⇒ a shift of (−700, −100), scale 1/3.
    expect(morphTransform(from, to)).toBe("translate(-700px, -100px) scale(0.3333)");
  });

  it("the scale is UNIFORM — the frame is not squashed on the way", () => {
    const from = { left: 0, top: 0, width: 100, height: 100 };
    const to = { left: 0, top: 0, width: 400, height: 200 };
    // Centres (50, 50) and (200, 100) ⇒ a shift of (−150, −50). The axes would give 0.25 and 0.5;
    // the larger wins so the frame covers the tile without margins, and morphClip trims the rest.
    expect(morphTransform(from, to)).toBe("translate(-150px, -50px) scale(0.5)");
  });

  it("on matching boxes it does not move the frame at all", () => {
    const box = { left: 40, top: 60, width: 320, height: 240 };
    expect(morphTransform(box, box)).toBe("translate(0px, 0px) scale(1)");
  });

  it("returns null if either box is degenerate", () => {
    const ok = { left: 0, top: 0, width: 100, height: 100 };
    // The tile is not rendered yet (hidden, zero size) — there is nothing to morph from.
    expect(morphTransform({ left: 0, top: 0, width: 0, height: 100 }, ok)).toBeNull();
    expect(morphTransform({ left: 0, top: 0, width: 100, height: 0 }, ok)).toBeNull();
    // The hero has no dimensions yet — division by zero is not allowed.
    expect(morphTransform(ok, { left: 0, top: 0, width: 0, height: 100 })).toBeNull();
    expect(morphTransform(ok, { left: 0, top: 0, width: 100, height: 0 })).toBeNull();
  });

  it("rounds numbers — the transform string must be stable between frames", () => {
    const from = { left: 10.006, top: 0, width: 100, height: 100 };
    const to = { left: 0, top: 0, width: 300, height: 300 };
    expect(morphTransform(from, to)).toBe("translate(-89.99px, -100px) scale(0.3333)");
  });
});

describe("morphRadius", () => {
  it("returns the radius that AFTER shrinking gives the tile's radius", () => {
    // An 800×540 frame sits into a 400×270 tile at scale 0.5, so the frame's radius must be taken
    // twice as large: the transform shrinks that too.
    const from = { left: 0, top: 0, width: 400, height: 270 };
    const to = { left: 0, top: 0, width: 800, height: 540 };
    expect(morphRadius(from, to, 19)).toBe("38px");
  });

  it("on matching boxes returns the radius as is", () => {
    const box = { left: 10, top: 10, width: 300, height: 200 };
    expect(morphRadius(box, box, 20)).toBe("20px");
  });

  it("the tile's right angles stay right", () => {
    const from = { left: 0, top: 0, width: 100, height: 100 };
    const to = { left: 0, top: 0, width: 400, height: 400 };
    expect(morphRadius(from, to, 0)).toBe("0px");
  });

  it("returns null on degenerate boxes and a negative radius", () => {
    const ok = { left: 0, top: 0, width: 100, height: 100 };
    expect(morphRadius({ left: 0, top: 0, width: 0, height: 100 }, ok, 12)).toBeNull();
    expect(morphRadius(ok, { left: 0, top: 0, width: 0, height: 100 }, 12)).toBeNull();
    expect(morphRadius(ok, ok, -1)).toBeNull();
  });
});

describe("cssDurationMs", () => {
  it("reads milliseconds", () => {
    expect(cssDurationMs("320ms")).toBe(320);
    expect(cssDurationMs("  440ms  ")).toBe(440);
  });

  it("reads seconds — including without a zero before the point", () => {
    // Exactly what the build minifier rewrites `320ms` into. `parseInt` silently gives NaN there
    // and the value falls back to a default, so CSS animates one duration while JS timers count
    // another (caught on the live board: the tile flickered on landing).
    expect(cssDurationMs(".32s")).toBe(320);
    expect(cssDurationMs("0.44s")).toBe(440);
    expect(cssDurationMs("1s")).toBe(1000);
  });

  it("returns null on an empty, zero or unclear value", () => {
    expect(cssDurationMs("")).toBeNull();
    expect(cssDurationMs("   ")).toBeNull();
    expect(cssDurationMs("0ms")).toBeNull();
    expect(cssDurationMs("-120ms")).toBeNull();
    // With no unit it is not a duration: a bare number is invalid CSS, and guessing for a skin is
    // not our business.
    expect(cssDurationMs("320")).toBeNull();
    expect(cssDurationMs("fast")).toBeNull();
  });
});
