import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  dropIndex,
  EMPTY_BOARD,
  fromPublished,
  isComplete,
  place,
  shirtStandings,
  SHIRTS,
  tierlistErrorText,
  unplaced,
  type Shirt,
} from "./tierlist";

const shirts: Shirt[] = [
  { id: "a", image: "/a.svg", large: "/a-large.svg" },
  { id: "b", image: "/b.svg", large: "/b-large.svg" },
  { id: "c", image: "/c.svg", large: "/c-large.svg" },
];

describe("place", () => {
  it("drops a shirt at the end of a tier by default", () => {
    const board = place(place(EMPTY_BOARD, "a", "S"), "b", "S");
    expect(board.S).toEqual(["a", "b"]);
  });

  it("inserts before the given index", () => {
    const board = place(place(EMPTY_BOARD, "a", "S"), "b", "S", 0);
    expect(board.S).toEqual(["b", "a"]);
  });

  it("moves a shirt out of its old tier — one shirt, one place", () => {
    const board = place(place(EMPTY_BOARD, "a", "S"), "a", "D");
    expect(board.S).toEqual([]);
    expect(board.D).toEqual(["a"]);
  });

  it("reorders inside one tier, counting the index after removal", () => {
    let board = EMPTY_BOARD;
    for (const id of ["a", "b", "c"]) board = place(board, id, "A");
    expect(place(board, "a", "A", 2).A).toEqual(["b", "c", "a"]);
  });

  it("sending a shirt to the pool takes it off the board", () => {
    const board = place(place(EMPTY_BOARD, "a", "B"), "a", "pool");
    expect(board.B).toEqual([]);
  });

  it("never mutates the board it was given", () => {
    const before = place(EMPTY_BOARD, "a", "S");
    place(before, "b", "S");
    expect(before.S).toEqual(["a"]);
    expect(EMPTY_BOARD.S).toEqual([]);
  });
});

describe("unplaced / isComplete", () => {
  it("the pool keeps catalogue order and publish opens only when it is empty", () => {
    let board = place(EMPTY_BOARD, "b", "C");
    expect(unplaced(board, shirts).map((s) => s.id)).toEqual(["a", "c"]);
    expect(isComplete(board, shirts)).toBe(false);
    board = place(place(board, "a", "S"), "c", "D");
    expect(isComplete(board, shirts)).toBe(true);
  });
});

describe("fromPublished", () => {
  it("keeps known shirts in known tiers and drops the rest", () => {
    const board = fromPublished({ S: ["a", "gone"], X: ["b"], D: ["c", "c"] }, shirts);
    expect(board.S).toEqual(["a"]);
    expect(board.D).toEqual(["c"]);
    expect(board.A).toEqual([]);
  });
});

describe("tierlistErrorText", () => {
  it("speaks Russian for known codes and falls back to a retry line", () => {
    expect(tierlistErrorText("too_long", "nick")).toMatch(/ник/);
    expect(tierlistErrorText("rate_limited")).toMatch(/часто/);
    expect(tierlistErrorText("whatever")).toMatch(/ещё раз/);
  });
});

describe("SHIRTS", () => {
  it("ids are unique, in the server's alphabet, and every picture exists", () => {
    expect(new Set(SHIRTS.map((s) => s.id)).size).toBe(SHIRTS.length);
    for (const shirt of SHIRTS) {
      expect(shirt.id).toMatch(/^[a-z0-9-]{1,40}$/);
      expect(existsSync(`public${shirt.image}`), shirt.image).toBe(true);
    }
  });
});

describe("dropIndex", () => {
  const row = (ids: string[]) => ({ ...EMPTY_BOARD, S: ids });

  it("lands before or after the shirt under the pointer", () => {
    expect(dropIndex(row(["b", "c"]), "a", "S", "c", false)).toBe(1);
    expect(dropIndex(row(["b", "c"]), "a", "S", "c", true)).toBe(2);
  });

  it("dropping onto a later neighbour in the same row accounts for the lifted shirt", () => {
    const board = row(["a", "b", "c"]);
    expect(place(board, "a", "S", dropIndex(board, "a", "S", "b", false)).S).toEqual(["a", "b", "c"]);
    expect(place(board, "a", "S", dropIndex(board, "a", "S", "b", true)).S).toEqual(["b", "a", "c"]);
    expect(place(board, "c", "S", dropIndex(board, "c", "S", "a", false)).S).toEqual(["c", "a", "b"]);
  });

  it("no shirt under the pointer means the end of the row", () => {
    expect(dropIndex(row(["b"]), "a", "S", null, false)).toBeUndefined();
  });
});

describe("shirtStandings", () => {
  const lists = [
    { tiers: { S: ["a"], A: ["b"], B: [], C: [], D: ["c"] } },
    { tiers: { S: ["b", "a"], A: [], B: [], C: [], D: ["c"] } },
  ];

  it("averages the overall place (read S down to D) and the tier number, best first", () => {
    const rows = shirtStandings(lists, shirts);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(rows[0]).toMatchObject({ id: "a", votes: 2, avgPlace: 1.5, avgTier: 1, tierLetter: "S" });
    expect(rows[1]).toMatchObject({ id: "b", avgPlace: 1.5, avgTier: 1.5, tierLetter: "A" });
    expect(rows[2]).toMatchObject({ id: "c", avgPlace: 3, avgTier: 5, tierLetter: "D" });
  });

  it("a shirt nobody placed is listed last with no averages", () => {
    const rows = shirtStandings([{ tiers: { S: ["a"] } }], shirts);
    expect(rows[0].id).toBe("a");
    expect(rows.at(-1)).toMatchObject({ votes: 0, avgPlace: null, avgTier: null, tierLetter: null });
  });
});
