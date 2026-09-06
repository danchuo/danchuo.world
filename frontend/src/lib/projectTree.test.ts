import { describe, expect, it } from "vitest";
import { treeBranch } from "./projectTree";

describe("treeBranch", () => {
  it("последний элемент закрывает список углом", () => {
    expect(treeBranch(2, 3)).toBe("corner");
  });

  it("все остальные висят на тройнике", () => {
    expect(treeBranch(0, 3)).toBe("tee");
    expect(treeBranch(1, 3)).toBe("tee");
  });

  it("единственный проект — сразу угол: ветке нечего продолжать", () => {
    expect(treeBranch(0, 1)).toBe("corner");
  });

  // Угол считается по ВСЕМУ списку, а не по видимому окну (DESIGN §7.8): при прокрутке
  // последний элемент уезжает под срез, и видимые строки честно остаются тройниками —
  // ровно это и означает «дерево продолжается за краем».
  it("за пределами окна прокрутки угол остаётся у настоящего последнего", () => {
    expect(treeBranch(2, 5)).toBe("tee");
    expect(treeBranch(4, 5)).toBe("corner");
  });
});
