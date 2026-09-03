import { describe, expect, it } from "vitest";
import { edgeVector } from "./tileEdgeLight";

/** Плитка 200×100 в точке (100, 50) экрана — считать от неё удобно в уме. */
const RECT = { left: 100, top: 50, width: 200, height: 100 };

describe("edgeVector", () => {
  it("центр плитки — нулевой вектор: свет ровный по всей кромке", () => {
    expect(edgeVector(RECT, 200, 100)).toEqual({ dx: 0, dy: 0 });
  });

  it("углы дают единичные орты — свет уходит в ближний к курсору торец", () => {
    expect(edgeVector(RECT, 100, 50)).toEqual({ dx: -1, dy: -1 });
    expect(edgeVector(RECT, 300, 150)).toEqual({ dx: 1, dy: 1 });
  });

  it("координата на четверти ширины даёт половину орта — свет едет плавно, а не скачком", () => {
    expect(edgeVector(RECT, 150, 100)).toEqual({ dx: -0.5, dy: 0 });
  });

  it("точка за пределами плитки зажимается в [-1, 1]", () => {
    // Указатель успевает уйти за границу между кадрами rAF: без зажима торец получил бы
    // смещение больше своей же коробки и блик оторвался бы от кромки.
    expect(edgeVector(RECT, -400, 900)).toEqual({ dx: -1, dy: 1 });
  });

  it("плитка нулевого размера — null, а не деление на ноль", () => {
    // Скрытая волной плитка (`display: none`) отдаёт нулевой rect: делить на него нельзя,
    // и писать в неё переменные незачем.
    expect(edgeVector({ left: 0, top: 0, width: 0, height: 0 }, 0, 0)).toBeNull();
  });
});
