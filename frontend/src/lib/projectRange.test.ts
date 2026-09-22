import { describe, expect, it } from "vitest";
import { formatQuarterRange } from "./projectRange";

describe("formatQuarterRange", () => {
  it("both ends with quarters", () => {
    expect(formatQuarterRange(2025, 3, 2026, 1)).toBe("Q3 2025 — Q1 2026");
  });

  it("an open end → \"now\"", () => {
    expect(formatQuarterRange(2025, 3, null, null)).toBe("Q3 2025 — наст.");
    expect(formatQuarterRange(2026, 1, null, null)).toBe("Q1 2026 — наст.");
  });

  it("without quarters — years only", () => {
    expect(formatQuarterRange(2024, null, 2025, null)).toBe("2024 — 2025");
  });

  it("matching ends collapse into one (a one-quarter project)", () => {
    expect(formatQuarterRange(2026, 2, 2026, 2)).toBe("Q2 2026");
    expect(formatQuarterRange(2024, null, 2024, null)).toBe("2024");
  });
});
