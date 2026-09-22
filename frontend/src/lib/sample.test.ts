import { describe, expect, it } from "vitest";
import { pickSeeded } from "./sample";

describe("pickSeeded — a draw stable for one seed (DESIGN §7.5)", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("one seed and one list ⇒ the same sample (the cached copy and the network answer match)", () => {
    expect(pickSeeded(items, 3, 0.4242)).toEqual(pickSeeded([...items], 3, 0.4242));
    expect(pickSeeded(items, 1, 0.77)).toEqual(pickSeeded([...items], 1, 0.77));
  });

  it("different seeds give different samples (the draw stays a draw between loads)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(pickSeeded(items, 1, i / 40)[0]);
    expect(seen.size).toBeGreaterThan(3);
  });

  it("takes exactly count items without repeats, no more than there are", () => {
    const four = pickSeeded(items, 4, 0.1);
    expect(four).toHaveLength(4);
    expect(new Set(four).size).toBe(4);
    expect(pickSeeded(["x", "y"], 5, 0.5)).toHaveLength(2);
    expect(pickSeeded([], 3, 0.5)).toEqual([]);
  });

  it("does not touch the original list", () => {
    const copy = [...items];
    pickSeeded(items, 5, 0.9);
    expect(items).toEqual(copy);
  });
});
