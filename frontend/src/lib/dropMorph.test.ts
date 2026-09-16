import { describe, expect, it } from "vitest";
import { cssDurationMs, morphClip, morphRadius, morphTransform } from "./dropMorph";

describe("morphClip", () => {
  it("режет кадр по короткой оси — ровно то, что не влезло в плитку", () => {
    // A 100×100 tile and a 400×200 hero: scale 0.5, so a 200×200 piece fits the tile and
    // (400 − 200) / 2 = 100 must be trimmed from each side by width.
    const from = { left: 0, top: 0, width: 100, height: 100 };
    const to = { left: 0, top: 0, width: 400, height: 200 };
    expect(morphClip(from, to, 0)).toBe("inset(0px 100px)");
  });

  it("вдоль оси, по которой масштаб и выбран, не режет ничего", () => {
    const from = { left: 0, top: 0, width: 200, height: 100 };
    const to = { left: 0, top: 0, width: 400, height: 200 };
    // The proportions match ⇒ the frame sits in the tile exactly, with nothing to trim.
    expect(morphClip(from, to, 0)).toBe("inset(0px 0px)");
  });

  it("скругление уезжает в клип, поделённое на масштаб", () => {
    const from = { left: 0, top: 0, width: 100, height: 100 };
    const to = { left: 0, top: 0, width: 400, height: 200 };
    expect(morphClip(from, to, 6)).toBe("inset(0px 100px round 12px)");
  });

  it("отдаёт null на вырожденных боксах — как и трансформация", () => {
    expect(morphClip({ left: 0, top: 0, width: 0, height: 10 }, { left: 0, top: 0, width: 10, height: 10 }, 4)).toBeNull();
  });
});

describe("morphTransform", () => {
  it("ставит героя ровно в границы плитки: центр в центр, размер в размер", () => {
    // A 300×200 tile in the screen's left half, a 900×600 hero in the centre.
    const from = { left: 100, top: 200, width: 300, height: 200 };
    const to = { left: 500, top: 100, width: 900, height: 600 };
    // Centres: the tile (250, 300), the hero (950, 400) ⇒ a shift of (−700, −100), scale 1/3.
    expect(morphTransform(from, to)).toBe("translate(-700px, -100px) scale(0.3333)");
  });

  it("масштаб РАВНОМЕРНЫЙ — кадр по дороге не сплющивается", () => {
    const from = { left: 0, top: 0, width: 100, height: 100 };
    const to = { left: 0, top: 0, width: 400, height: 200 };
    // Centres (50, 50) and (200, 100) ⇒ a shift of (−150, −50). The axes would give 0.25 and 0.5;
    // the larger wins so the frame covers the tile without margins, and morphClip trims the rest.
    expect(morphTransform(from, to)).toBe("translate(-150px, -50px) scale(0.5)");
  });

  it("на совпадающих боксах не двигает кадр вовсе", () => {
    const box = { left: 40, top: 60, width: 320, height: 240 };
    expect(morphTransform(box, box)).toBe("translate(0px, 0px) scale(1)");
  });

  it("отдаёт null, если любой из боксов вырожден", () => {
    const ok = { left: 0, top: 0, width: 100, height: 100 };
    // The tile is not rendered yet (hidden, zero size) — there is nothing to morph from.
    expect(morphTransform({ left: 0, top: 0, width: 0, height: 100 }, ok)).toBeNull();
    expect(morphTransform({ left: 0, top: 0, width: 100, height: 0 }, ok)).toBeNull();
    // The hero has no dimensions yet — division by zero is not allowed.
    expect(morphTransform(ok, { left: 0, top: 0, width: 0, height: 100 })).toBeNull();
    expect(morphTransform(ok, { left: 0, top: 0, width: 100, height: 0 })).toBeNull();
  });

  it("округляет числа — строка трансформации должна быть стабильной между кадрами", () => {
    const from = { left: 10.006, top: 0, width: 100, height: 100 };
    const to = { left: 0, top: 0, width: 300, height: 300 };
    expect(morphTransform(from, to)).toBe("translate(-89.99px, -100px) scale(0.3333)");
  });
});

describe("morphRadius", () => {
  it("возвращает радиус, который ПОСЛЕ сжатия даст радиус плитки", () => {
    // An 800×540 frame sits into a 400×270 tile at scale 0.5, so the frame's radius must be taken
    // twice as large: the transform shrinks that too.
    const from = { left: 0, top: 0, width: 400, height: 270 };
    const to = { left: 0, top: 0, width: 800, height: 540 };
    expect(morphRadius(from, to, 19)).toBe("38px");
  });

  it("на совпадающих боксах отдаёт радиус как есть", () => {
    const box = { left: 10, top: 10, width: 300, height: 200 };
    expect(morphRadius(box, box, 20)).toBe("20px");
  });

  it("прямые углы плитки остаются прямыми", () => {
    const from = { left: 0, top: 0, width: 100, height: 100 };
    const to = { left: 0, top: 0, width: 400, height: 400 };
    expect(morphRadius(from, to, 0)).toBe("0px");
  });

  it("отдаёт null на вырожденных боксах и отрицательном радиусе", () => {
    const ok = { left: 0, top: 0, width: 100, height: 100 };
    expect(morphRadius({ left: 0, top: 0, width: 0, height: 100 }, ok, 12)).toBeNull();
    expect(morphRadius(ok, { left: 0, top: 0, width: 0, height: 100 }, 12)).toBeNull();
    expect(morphRadius(ok, ok, -1)).toBeNull();
  });
});

describe("cssDurationMs", () => {
  it("читает миллисекунды", () => {
    expect(cssDurationMs("320ms")).toBe(320);
    expect(cssDurationMs("  440ms  ")).toBe(440);
  });

  it("читает секунды — в том числе без нуля перед точкой", () => {
    // Exactly what the build minifier rewrites `320ms` into. `parseInt` silently gives NaN there
    // and the value falls back to a default, so CSS animates one duration while JS timers count
    // another (caught on the live board: the tile flickered on landing).
    expect(cssDurationMs(".32s")).toBe(320);
    expect(cssDurationMs("0.44s")).toBe(440);
    expect(cssDurationMs("1s")).toBe(1000);
  });

  it("отдаёт null на пустом, нулевом и невнятном значении", () => {
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
