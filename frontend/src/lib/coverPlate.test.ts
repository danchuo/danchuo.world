import { describe, expect, it } from "vitest";
import { COVER_PLATES, coverPlate } from "./coverPlate";

describe("coverPlate", () => {
  it("плашек ровно пять — по числу законных сочетаний знака и фона", () => {
    expect(COVER_PLATES).toBe(5);
  });

  it("всегда попадает в набор", () => {
    const seeds = ["spotify:track:1", "Strobe", "", "Ghosts n Stuff", "https://open.spotify.com/track/xyz"];
    for (const s of seeds) {
      const n = coverPlate(s);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(COVER_PLATES);
    }
  });

  it("один и тот же трек — всегда одна и та же плашка", () => {
    // Иначе плашка менялась бы на каждой перерисовке: список мигал бы цветами сам по себе.
    expect(coverPlate("spotify:track:abc")).toBe(coverPlate("spotify:track:abc"));
  });

  it("соседние треки расходятся по плашкам, а не липнут к одной", () => {
    // Ссылки Spotify отличаются хвостом, и слабый хэш дал бы всему списку один цвет.
    const set = new Set(
      ["1A", "1B", "1C", "1D", "1E", "1F", "1G", "1H"].map((s) => coverPlate(`https://open.spotify.com/track/${s}`)),
    );
    expect(set.size).toBeGreaterThanOrEqual(3);
  });

  it("без ключа — первая плашка, а не падение", () => {
    expect(coverPlate(null)).toBe(0);
    expect(coverPlate("")).toBe(0);
  });
});
