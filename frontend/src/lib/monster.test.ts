import { describe, expect, it } from "vitest";
import { monsterVerdict } from "./monster";

describe("monster verdict", () => {
  it("speaks in a verb, not \"done/not done\"", () => {
    expect(monsterVerdict(true).verb).toBe("пил");
    expect(monsterVerdict(false).verb).toBe("не пил");
  });

  it("the whole phrase puts the verb BEFORE the word \"monster\" — that is how it is read aloud", () => {
    expect(monsterVerdict(true).phrase).toBe("пил монстр");
    expect(monsterVerdict(false).phrase).toBe("не пил монстр");
  });

  it("the colours are different tokens, not two shades of alarm", () => {
    // A regression anchor: "not drunk" once took --accent, which on wave 01 is nearly the same
    // tone as --danger. The states differed by one word.
    expect(monsterVerdict(false).color).toContain("--accent-clean");
    expect(monsterVerdict(true).color).toContain("--danger");
    // Nor is the green borrowed from another role: --accent-code is the GitHub channel and
    // --success holds the trail's links (DESIGN §3.2).
    expect(monsterVerdict(false).color).not.toContain("--accent-code");
    expect(monsterVerdict(false).color).not.toContain("--success");
  });

  it("the tone is the state key for CSS modifiers (map, calendar)", () => {
    expect(monsterVerdict(true).tone).toBe("drunk");
    expect(monsterVerdict(false).tone).toBe("clean");
  });

  it("no data for the day — NO verdict, not \"did not drink\" by default", () => {
    // Defaulting to "not drunk" passed an absent record off as a fact: nobody marked the monster
    // on a future day or a hole, while the board claimed the day was clean.
    const unknown = monsterVerdict(null);
    expect(unknown.tone).toBe("unknown");
    expect(unknown.verb).toBeNull();
    expect(unknown.phrase).toBe("нет данных о монстре");
  });

  it("\"no data\" stays silent in colour too: neither green nor alarming", () => {
    const unknown = monsterVerdict(null);
    expect(unknown.color).not.toContain("--accent-clean");
    expect(unknown.color).not.toContain("--danger");
    expect(unknown.color).toContain("--text-tertiary");
  });
});
