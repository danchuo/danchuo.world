import { describe, expect, it } from "vitest";
import { spinePaths } from "./boardSpine";
import { resolveLayout } from "./layout";
import { WAVES } from "./waves";

const layoutOf = (key: string) => resolveLayout(WAVES.find((w) => w.key === key)?.layout);

describe("spinePaths", () => {
  // A Wednesday: the calendar's weeks run Monday to Sunday around it.
  const today = "2026-09-23";

  it("names the first requests of a field-calendar board, byte for byte as the board sends them", () => {
    expect(spinePaths(layoutOf("wave-03"), today)).toEqual([
      "/api/days/2026-09-23",
      // Three weeks back and one forward: the edge week each side of the field edition.
      "/api/days?from=2026-08-31&to=2026-10-04",
      "/api/days?from=2026-09-10&to=2026-09-23",
      "/api/days?from=2026-08-25&to=2026-09-23",
    ]);
  });

  it("a plain calendar reaches two weeks back and one forward", () => {
    expect(spinePaths(layoutOf("wave-01"), today)[1]).toBe("/api/days?from=2026-09-07&to=2026-10-04");
  });
});
