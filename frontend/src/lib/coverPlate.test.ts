import { describe, expect, it } from "vitest";
import { COVER_PLATES, coverPlate } from "./coverPlate";

describe("coverPlate", () => {
  it("exactly five plates — one per valid mark and background combination", () => {
    expect(COVER_PLATES).toBe(5);
  });

  it("always ends up in the set", () => {
    const seeds = ["spotify:track:1", "Strobe", "", "Ghosts n Stuff", "https://open.spotify.com/track/xyz"];
    for (const s of seeds) {
      const n = coverPlate(s);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(COVER_PLATES);
    }
  });

  it("the same track always gets the same plate", () => {
    // Otherwise the plate would change on every repaint and the list would flicker by itself.
    expect(coverPlate("spotify:track:abc")).toBe(coverPlate("spotify:track:abc"));
  });

  it("adjacent tracks go to different plates instead of sticking to one", () => {
    // Spotify links differ only in their tail, and a weak hash would give the whole list one colour.
    const set = new Set(
      ["1A", "1B", "1C", "1D", "1E", "1F", "1G", "1H"].map((s) => coverPlate(`https://open.spotify.com/track/${s}`)),
    );
    expect(set.size).toBeGreaterThanOrEqual(3);
  });

  it("without a key — the first plate, not a crash", () => {
    expect(coverPlate(null)).toBe(0);
    expect(coverPlate("")).toBe(0);
  });
});
