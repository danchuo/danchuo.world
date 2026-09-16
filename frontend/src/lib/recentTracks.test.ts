import { describe, expect, it } from "vitest";
import { formatPlayedAgo } from "./recentTracks";

/** The tests' fixed "now", so deltas are computed rather than guessed. */
const NOW = Date.parse("2026-09-03T12:00:00Z");

/** An ISO stamp "this many milliseconds ago". */
function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe("formatPlayedAgo", () => {
  it("меньше минуты — «сейчас», без нулевых цифр", () => {
    // "0 min" on screen reads as a broken counter rather than freshness.
    expect(formatPlayedAgo(ago(0), NOW)).toBe("сейчас");
    expect(formatPlayedAgo(ago(59_000), NOW)).toBe("сейчас");
  });

  it("минуты — до часа", () => {
    expect(formatPlayedAgo(ago(60_000), NOW)).toBe("1 мин");
    expect(formatPlayedAgo(ago(14 * 60_000), NOW)).toBe("14 мин");
    expect(formatPlayedAgo(ago(59 * 60_000), NOW)).toBe("59 мин");
  });

  it("часы — до суток", () => {
    expect(formatPlayedAgo(ago(3_600_000), NOW)).toBe("1 ч");
    expect(formatPlayedAgo(ago(23 * 3_600_000), NOW)).toBe("23 ч");
  });

  it("дальше суток — дни", () => {
    expect(formatPlayedAgo(ago(24 * 3_600_000), NOW)).toBe("1 дн");
    expect(formatPlayedAgo(ago(9 * 24 * 3_600_000), NOW)).toBe("9 дн");
  });

  it("единицы режутся ВНИЗ: 119 минут — это ещё «1 ч», а не «2 ч»", () => {
    expect(formatPlayedAgo(ago(119 * 60_000), NOW)).toBe("1 ч");
  });

  it("метка из будущего не даёт отрицательных чисел", () => {
    // The client's clock and Spotify's differ by seconds; a negative age in the list is unacceptable.
    expect(formatPlayedAgo(new Date(NOW + 30_000).toISOString(), NOW)).toBe("сейчас");
  });

  it("без метки и с мусором вместо неё — нечего показывать", () => {
    expect(formatPlayedAgo(null, NOW)).toBeNull();
    expect(formatPlayedAgo("не дата", NOW)).toBeNull();
  });
});
