import { describe, expect, it } from "vitest";
import { cssDurationMs, morphRadius, morphTransform } from "./dropMorph";

describe("morphTransform", () => {
  it("ставит героя ровно в границы плитки: центр в центр, размер в размер", () => {
    // Плитка 300×200 в левой половине экрана, герой 900×600 по центру.
    const from = { left: 100, top: 200, width: 300, height: 200 };
    const to = { left: 500, top: 100, width: 900, height: 600 };
    // Центры: плитка (250, 300), герой (950, 400) ⇒ сдвиг (−700, −100), масштаб 1/3.
    expect(morphTransform(from, to)).toBe("translate(-700px, -100px) scale(0.3333, 0.3333)");
  });

  it("считает масштаб по осям независимо — пропорции боксов совпадать не обязаны", () => {
    const from = { left: 0, top: 0, width: 100, height: 100 };
    const to = { left: 0, top: 0, width: 400, height: 200 };
    // Центры: (50, 50) и (200, 100) ⇒ сдвиг (−150, −50), масштаб 0.25 по X и 0.5 по Y.
    expect(morphTransform(from, to)).toBe("translate(-150px, -50px) scale(0.25, 0.5)");
  });

  it("на совпадающих боксах не двигает кадр вовсе", () => {
    const box = { left: 40, top: 60, width: 320, height: 240 };
    expect(morphTransform(box, box)).toBe("translate(0px, 0px) scale(1, 1)");
  });

  it("отдаёт null, если любой из боксов вырожден", () => {
    const ok = { left: 0, top: 0, width: 100, height: 100 };
    // Плитка ещё не отрисована (скрыта, нулевой размер) — морфить не из чего.
    expect(morphTransform({ left: 0, top: 0, width: 0, height: 100 }, ok)).toBeNull();
    expect(morphTransform({ left: 0, top: 0, width: 100, height: 0 }, ok)).toBeNull();
    // Герой ещё не получил размеров — делить на ноль нельзя.
    expect(morphTransform(ok, { left: 0, top: 0, width: 0, height: 100 })).toBeNull();
    expect(morphTransform(ok, { left: 0, top: 0, width: 100, height: 0 })).toBeNull();
  });

  it("округляет числа — строка трансформации должна быть стабильной между кадрами", () => {
    const from = { left: 10.006, top: 0, width: 100, height: 100 };
    const to = { left: 0, top: 0, width: 300, height: 300 };
    expect(morphTransform(from, to)).toBe("translate(-89.99px, -100px) scale(0.3333, 0.3333)");
  });
});

describe("morphRadius", () => {
  it("возвращает радиус, который ПОСЛЕ сжатия даст радиус плитки", () => {
    // Кадр 800×540 садится в плитку 400×270 — масштаб 0.5, значит скругление на кадре надо
    // взять вдвое крупнее: transform сжимает и его.
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
    // Ровно то, во что минификатор сборки переписывает `320ms`: `.32s`. `parseInt` на таком
    // молча даёт NaN, и число подменяется дефолтом — анимация в CSS играет одну длительность,
    // а таймеры в JS считают другую (поймано на живом борде: мигание плитки на посадке).
    expect(cssDurationMs(".32s")).toBe(320);
    expect(cssDurationMs("0.44s")).toBe(440);
    expect(cssDurationMs("1s")).toBe(1000);
  });

  it("отдаёт null на пустом, нулевом и невнятном значении", () => {
    expect(cssDurationMs("")).toBeNull();
    expect(cssDurationMs("   ")).toBeNull();
    expect(cssDurationMs("0ms")).toBeNull();
    expect(cssDurationMs("-120ms")).toBeNull();
    // Без единицы — не длительность: голое число в CSS невалидно, и угадывать за скин нечего.
    expect(cssDurationMs("320")).toBeNull();
    expect(cssDurationMs("fast")).toBeNull();
  });
});
