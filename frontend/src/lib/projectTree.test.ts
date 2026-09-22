import { describe, expect, it } from "vitest";
import { treeBranch } from "./projectTree";

/**
 * A year is the root of its group's subtree and is joined to it by a HORIZONTAL (DESIGN §7.8): the
 * trunk starts at the year's level and goes down, with no vertical above it. Hence four kinds.
 */
describe("treeBranch", () => {
  it("the first row of a year is the head: the trunk starts at the year and goes down", () => {
    expect(treeBranch(0, 3)).toBe("head");
  });

  it("the means hang on a tee", () => {
    expect(treeBranch(1, 3)).toBe("tee");
  });

  it("the last one closes the year with a corner", () => {
    expect(treeBranch(2, 3)).toBe("corner");
  });

  /** A year's only project: there is no vertical to draw — one straight line from year to row. */
  it("a year's only project has no trunk", () => {
    expect(treeBranch(0, 1)).toBe("only");
  });

  // The elbow is computed over the WHOLE group, not the visible window (DESIGN §7.8): while
  // scrolling, the real last row goes under the cut and the visible rows honestly stay tees —
  // which is exactly what "the tree continues past the edge" means.
  it("outside the scroll window the corner stays with the real last one", () => {
    expect(treeBranch(2, 5)).toBe("tee");
    expect(treeBranch(4, 5)).toBe("corner");
  });
});
