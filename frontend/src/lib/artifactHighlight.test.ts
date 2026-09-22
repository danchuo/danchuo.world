import { describe, expect, it } from "vitest";
import {
  DRAG_DEADZONE,
  HIGHLIGHT_MIN,
  HIGHLIGHT_PAD,
  boxFromDrag,
  boxesAt,
  shotWindow,
  unionMask,
  padHighlight,
} from "./artifactHighlight";

const box = (x0: number, y0: number, x1: number, y1: number) => ({
  artifactId: 1,
  name: "предмет",
  x0,
  y0,
  x1,
  y1,
});

describe("padHighlight", () => {
  it("expands by a fraction of its own size on each side", () => {
    // 0.4 × 0.2 with a 15% margin ⇒ +0.06 on X and +0.03 on Y each side.
    const r = padHighlight(box(0.3, 0.4, 0.7, 0.6), 0.15);
    expect(r.x0).toBeCloseTo(0.24, 6);
    expect(r.y0).toBeCloseTo(0.37, 6);
    expect(r.width).toBeCloseTo(0.52, 6);
    expect(r.height).toBeCloseTo(0.26, 6);
  });

  it("does not spill past the frame at the very edge", () => {
    // An item flush with the top left corner: the margin would go negative.
    const r = padHighlight(box(0.0, 0.0, 0.2, 0.2), 0.5);
    expect(r.x0).toBe(0);
    expect(r.y0).toBe(0);
    expect(r.x0 + r.width).toBeLessThanOrEqual(1);
    expect(r.y0 + r.height).toBeLessThanOrEqual(1);
  });

  it("a full-frame box stays full-frame", () => {
    const r = padHighlight(box(0, 0, 1, 1));
    expect(r).toEqual({ x0: 0, y0: 0, width: 1, height: 1 });
  });

  it("a zero margin leaves the box as is", () => {
    const r = padHighlight(box(0.2, 0.3, 0.5, 0.9), 0);
    expect(r.x0).toBeCloseTo(0.2, 6);
    expect(r.width).toBeCloseTo(0.3, 6);
  });

  it("the default margin is 15%", () => {
    expect(HIGHLIGHT_PAD).toBe(0.15);
    expect(padHighlight(box(0.4, 0.4, 0.6, 0.6)).width).toBeCloseTo(0.26, 6);
  });
});

describe("padHighlight — minimum box size", () => {
  it("a tiny find grows to the minimum around its centre", () => {
    // Sunglasses in a wide shot: 2% of the frame. A 15% margin on 2% decides nothing — the box
    // would not be visible.
    const r = padHighlight(box(0.5, 0.5, 0.52, 0.52));
    expect(r.width).toBeCloseTo(HIGHLIGHT_MIN, 4);
    expect(r.height).toBeCloseTo(HIGHLIGHT_MIN, 4);
    // The finding's centre does not drift — the box grows equally both ways.
    expect(r.x0 + r.width / 2).toBeCloseTo(0.51, 4);
    expect(r.y0 + r.height / 2).toBeCloseTo(0.51, 4);
  });

  it("growth at the frame edge shifts the box inward instead of clipping it", () => {
    // In a corner symmetric growth would leave the frame: the minimum outranks centring, or at the
    // very edge the box would again fall below it.
    const r = padHighlight(box(0, 0, 0.01, 0.01));
    expect(r.x0).toBe(0);
    expect(r.y0).toBe(0);
    expect(r.width).toBeCloseTo(HIGHLIGHT_MIN, 4);
    expect(r.height).toBeCloseTo(HIGHLIGHT_MIN, 4);

    const far = padHighlight(box(0.99, 0.99, 1, 1));
    expect(far.x0 + far.width).toBeCloseTo(1, 4);
    expect(far.width).toBeCloseTo(HIGHLIGHT_MIN, 4);
  });

  it("the minimum works on each axis separately", () => {
    // Sunglasses are wide and very flat: the width suffices, the height must be raised.
    const r = padHighlight(box(0.2, 0.5, 0.8, 0.51), 0);
    expect(r.width).toBeCloseTo(0.6, 4);
    expect(r.height).toBeCloseTo(HIGHLIGHT_MIN, 4);
  });

  it("the minimum does not touch a large find", () => {
    const r = padHighlight(box(0.2, 0.3, 0.5, 0.9), 0);
    expect(r.width).toBeCloseTo(0.3, 6);
    expect(r.height).toBeCloseTo(0.6, 6);
  });

  it("a zero switches the minimum off — data is not replaced silently", () => {
    const r = padHighlight(box(0.5, 0.5, 0.52, 0.52), 0, 0);
    expect(r.width).toBeCloseTo(0.02, 6);
  });
});

describe("boxFromDrag — a box from a mouse drag", () => {
  it("a drag becomes a box regardless of direction", () => {
    const forward = boxFromDrag({ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.8 });
    // The drag may start from any corner — the box is the same.
    expect(boxFromDrag({ x: 0.6, y: 0.8 }, { x: 0.2, y: 0.3 })).toEqual(forward);
    expect(forward).toEqual({ x0: 0.2, y0: 0.3, x1: 0.6, y1: 0.8 });
  });

  it("a cursor that left the frame edge does not drag the box out of the frame", () => {
    // A mouse easily leaves the picture — the backend would reject such a box (coordinates outside 0..1).
    const r = boxFromDrag({ x: -0.4, y: 0.5 }, { x: 1.9, y: 1.4 })!;
    expect(r.x0).toBe(0);
    expect(r.y0).toBe(0.5);
    expect(r.x1).toBe(1);
    expect(r.y1).toBe(1);
  });

  it("a tiny drag grows to the minimum around its centre", () => {
    const r = boxFromDrag({ x: 0.5, y: 0.5 }, { x: 0.53, y: 0.52 })!;
    expect(r.x1 - r.x0).toBeCloseTo(HIGHLIGHT_MIN, 4);
    expect(r.y1 - r.y0).toBeCloseTo(HIGHLIGHT_MIN, 4);
    expect((r.x0 + r.x1) / 2).toBeCloseTo(0.515, 4);
    expect((r.y0 + r.y1) / 2).toBeCloseTo(0.51, 4);
  });

  it("the minimum at the frame edge shifts the box inward instead of clipping it", () => {
    const r = boxFromDrag({ x: 0, y: 0 }, { x: 0.02, y: 0.02 })!;
    expect(r.x0).toBe(0);
    expect(r.x1).toBeCloseTo(HIGHLIGHT_MIN, 4);
    const far = boxFromDrag({ x: 0.99, y: 0.99 }, { x: 1, y: 1 })!;
    expect(far.x1).toBeCloseTo(1, 4);
    expect(far.x1 - far.x0).toBeCloseTo(HIGHLIGHT_MIN, 4);
  });

  it("the minimum works on each axis separately", () => {
    // A flat drag along sunglasses: the width suffices, the height is raised.
    const r = boxFromDrag({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.505 })!;
    expect(r.x1 - r.x0).toBeCloseTo(0.6, 4);
    expect(r.y1 - r.y0).toBeCloseTo(HIGHLIGHT_MIN, 4);
  });

  it("a click without a drag does not become a box", () => {
    // Otherwise any stray touch of the frame would create a finding the size of the minimum.
    expect(boxFromDrag({ x: 0.4, y: 0.4 }, { x: 0.4, y: 0.4 })).toBeNull();
    const jitter = DRAG_DEADZONE / 2;
    expect(boxFromDrag({ x: 0.4, y: 0.4 }, { x: 0.4 + jitter, y: 0.4 + jitter })).toBeNull();
  });

  it("a drag along one axis is intentional, a box results", () => {
    // A thin strip along the item: far on X, barely moved on Y.
    const r = boxFromDrag({ x: 0.1, y: 0.4 }, { x: 0.7, y: 0.4 });
    expect(r).not.toBeNull();
    expect(r!.y1 - r!.y0).toBeCloseTo(HIGHLIGHT_MIN, 4);
  });

  it("does not touch a large drag at all", () => {
    expect(boxFromDrag({ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.7 })).toEqual({
      x0: 0.1,
      y0: 0.1,
      x1: 0.9,
      y1: 0.7,
    });
  });
});

describe("boxesAt — which boxes are under the cursor", () => {
  const named = (name: string, x0: number, y0: number, x1: number, y1: number) => ({
    ...box(x0, y0, x1, y1),
    name,
  });
  const left = named("очки", 0.1, 0.1, 0.4, 0.4);
  const right = named("футболка", 0.6, 0.6, 0.9, 0.9);
  const over = named("ракетка", 0.3, 0.3, 0.7, 0.7);

  it("none on an empty spot", () => {
    expect(boxesAt([left, right], 0.5, 0.05)).toEqual([]);
  });

  it("two finds on a frame: the one under the cursor is returned", () => {
    expect(boxesAt([left, right], 0.2, 0.2).map((b) => b.name)).toEqual(["очки"]);
    expect(boxesAt([left, right], 0.8, 0.8).map((b) => b.name)).toEqual(["футболка"]);
  });

  it("at an intersection of boxes both are returned — we have no right to choose for the viewer", () => {
    expect(boxesAt([left, over], 0.35, 0.35).map((b) => b.name)).toEqual(["очки", "ракетка"]);
  });

  it("we judge by the DRAWN box, not by the raw find", () => {
    // The box is wider than the finding by the margin and stretched to the minimum, and the cursor
    // in that air counts as a hover — otherwise the hint would not catch where the box is visible.
    const tiny = named("очки", 0.5, 0.5, 0.51, 0.51);
    expect(boxesAt([tiny], 0.545, 0.5).map((b) => b.name)).toEqual(["очки"]);
    expect(boxesAt([tiny], 0.7, 0.7)).toEqual([]);
  });
});

describe("shotWindow", () => {
  it("the frame as a background across the find's width: a quarter of the frame asks for 400% size", () => {
    const w = shotWindow({ x0: 0.25, y0: 0.5, width: 0.25, height: 0.5 });

    expect(w.size).toBe("400% 200%");
  });

  it("the shift is counted from the REMAINDER, otherwise the region slides past the find", () => {
    // 0.25 / (1 - 0.25) = 1/3 — the percentage that puts the background's left edge on x0.
    const w = shotWindow({ x0: 0.25, y0: 0.5, width: 0.25, height: 0.5 });

    expect(w.position).toBe("33.333% 100%");
  });

  it("a find spanning the whole axis has nothing to move along it — zero, not a division by zero", () => {
    const w = shotWindow({ x0: 0, y0: 0, width: 1, height: 1 });

    expect(w.position).toBe("0% 0%");
    expect(w.size).toBe("100% 100%");
  });
});

describe("unionMask", () => {
  it("one mask for all finds: the negative layer must be ONE", () => {
    const mask = unionMask([
      { x0: 0.25, y0: 0.5, width: 0.25, height: 0.5 },
      { x0: 0, y0: 0, width: 0.5, height: 0.5 },
    ]);

    expect(mask.split(", no-repeat").length - 1).toBe(0);
    expect(mask.split("no-repeat").length - 1).toBe(2);
    expect(mask).toContain("33.333% 100% / 25% 50% no-repeat");
    expect(mask).toContain("0% 0% / 50% 50% no-repeat");
  });

  it("without finds the mask is empty — nothing to paint", () => {
    expect(unionMask([])).toBe("");
  });
});
