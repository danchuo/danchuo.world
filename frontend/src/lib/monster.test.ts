import { describe, expect, it } from "vitest";
import { monsterVerdict } from "./monster";

describe("вердикт монстра", () => {
  it("говорит глаголом, а не «сделано/не сделано»", () => {
    expect(monsterVerdict(true).verb).toBe("пил");
    expect(monsterVerdict(false).verb).toBe("не пил");
  });

  it("фраза целиком ставит глагол ПЕРЕД словом «монстр» — так её и читают вслух", () => {
    expect(monsterVerdict(true).phrase).toBe("пил монстр");
    expect(monsterVerdict(false).phrase).toBe("не пил монстр");
  });

  it("цвета — разные токены, а не два оттенка тревоги", () => {
    // A regression anchor: "not drunk" once took --accent, which on wave 01 is nearly the same
    // tone as --danger. The states differed by one word.
    expect(monsterVerdict(false).color).toContain("--accent-clean");
    expect(monsterVerdict(true).color).toContain("--danger");
    // Nor is the green borrowed from another role: --accent-code is the GitHub channel and
    // --success holds the trail's links (DESIGN §3.2).
    expect(monsterVerdict(false).color).not.toContain("--accent-code");
    expect(monsterVerdict(false).color).not.toContain("--success");
  });

  it("тон — ключ состояния для CSS-модификаторов (карта, календарь)", () => {
    expect(monsterVerdict(true).tone).toBe("drunk");
    expect(monsterVerdict(false).tone).toBe("clean");
  });

  it("нет данных за день — вердикта НЕТ, а не «не пил» по умолчанию", () => {
    // Defaulting to "not drunk" passed an absent record off as a fact: nobody marked the monster
    // on a future day or a hole, while the board claimed the day was clean.
    const unknown = monsterVerdict(null);
    expect(unknown.tone).toBe("unknown");
    expect(unknown.verb).toBeNull();
    expect(unknown.phrase).toBe("нет данных о монстре");
  });

  it("«нет данных» молчит и цветом: ни зелёного, ни тревожного", () => {
    const unknown = monsterVerdict(null);
    expect(unknown.color).not.toContain("--accent-clean");
    expect(unknown.color).not.toContain("--danger");
    expect(unknown.color).toContain("--text-tertiary");
  });
});
