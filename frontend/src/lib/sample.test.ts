import { describe, expect, it } from "vitest";
import { pickSeeded } from "./sample";

describe("pickSeeded — жребий, стабильный на одно зерно (DESIGN §7.5)", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("одно зерно и один список ⇒ одна и та же выборка (копия из кэша и ответ сети совпадают)", () => {
    expect(pickSeeded(items, 3, 0.4242)).toEqual(pickSeeded([...items], 3, 0.4242));
    expect(pickSeeded(items, 1, 0.77)).toEqual(pickSeeded([...items], 1, 0.77));
  });

  it("разные зёрна дают разные выборки (жребий остаётся жребием между загрузками)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(pickSeeded(items, 1, i / 40)[0]);
    expect(seen.size).toBeGreaterThan(3);
  });

  it("берёт ровно count элементов без повторов, не больше, чем есть", () => {
    const four = pickSeeded(items, 4, 0.1);
    expect(four).toHaveLength(4);
    expect(new Set(four).size).toBe(4);
    expect(pickSeeded(["x", "y"], 5, 0.5)).toHaveLength(2);
    expect(pickSeeded([], 3, 0.5)).toEqual([]);
  });

  it("исходный список не трогает", () => {
    const copy = [...items];
    pickSeeded(items, 5, 0.9);
    expect(items).toEqual(copy);
  });
});
