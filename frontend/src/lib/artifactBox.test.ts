import { describe, expect, it } from "vitest";
import { laysOnSide } from "@/lib/artifactBox";

/**
 * Предикат «класть ли предмет набок» — тот же, которым живёт лента (DESIGN §7.2), но вынесенный
 * наружу: карточке предмета у рамки находки (§7.5) нужен ровно он, а габариты ленты — нет.
 */
describe("laysOnSide — флаг разрешает, решает геометрия", () => {
  const RACKET = 619 / 2055; // вытянутая вертикально: ракетка прода после обрезки полей
  const GLASSES = 2.82; // вытянутые горизонтально
  const CAMERA = 1191 / 853; // почти квадратная мыльница

  it("вытянутый вертикально предмет в горизонтальном слоте ложится набок", () => {
    expect(laysOnSide(RACKET, true, false)).toBe(true);
  });

  it("без разрешения предмета не поворачивается никогда", () => {
    // Главный инвариант: у очков и мыльницы есть «правильная сторона».
    expect(laysOnSide(RACKET, false, false)).toBe(false);
    expect(laysOnSide(GLASSES, false, true)).toBe(false);
  });

  it("предмет, уже лежащий вдоль слота, не переворачивается", () => {
    expect(laysOnSide(GLASSES, true, false)).toBe(false);
    expect(laysOnSide(RACKET, true, true)).toBe(false);
  });

  it("невытянутый предмет не поворачивается даже с разрешения", () => {
    expect(laysOnSide(CAMERA, true, false)).toBe(false);
    expect(laysOnSide(CAMERA, true, true)).toBe(false);
  });

  it("неизмеренная картинка считается квадратной — поворота нет", () => {
    // До onLoad ratio нулевой: повернуть «на всякий случай» значит показать предмет боком.
    expect(laysOnSide(0, true, false)).toBe(false);
    expect(laysOnSide(Number.NaN, true, false)).toBe(false);
  });
});
