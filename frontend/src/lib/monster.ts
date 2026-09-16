/**
 * The monster's verdict — THE ONLY wording of "drank / did not" on the whole board. It appears in
 * four places, and three vocabularies for one fact would answer nothing. The monster is an EVENT,
 * not a discipline item: neither state is an achievement, so it has its own pair. DESIGN §4.1
 */

/**
 * The monster's state key, also naming the CSS modifiers of map and calendar. There are THREE
 * states, not two: `unknown` is required for the same reason the calendar lens has a third answer
 * — without it a missing record passes for a fact, and "did not drink" is claimed for the owner.
 */
export type MonsterTone = "clean" | "drunk" | "unknown";

export interface MonsterVerdict {
  /** The verdict's verb, which is what gets coloured. `null` = no answer, so no verb is drawn. */
  verb: string | null;
  /** The whole verdict — for speech, hints and labels. The verb comes BEFORE the noun. */
  phrase: string;
  /** A wave token with a fallback: green "clean", alarming "drunk", quiet tertiary "no answer". */
  color: string;
  tone: MonsterTone;
}

/**
 * `drunk` is whether the monster was drunk that day; `null` means there is no record at all. The
 * colours are DIFFERENT ROLES, not two shades of one: the board's accent is almost the danger tone,
 * and success holds the route's links, which would make "did not drink" a discipline item. §4.2
 */
export function monsterVerdict(drunk: boolean | null): MonsterVerdict {
  if (drunk == null) {
    return {
      verb: null,
      phrase: "нет данных о монстре",
      color: "var(--text-tertiary)",
      tone: "unknown",
    };
  }
  return drunk
    ? { verb: "пил", phrase: "пил монстр", color: "var(--danger, #d1553b)", tone: "drunk" }
    : {
        verb: "не пил",
        phrase: "не пил монстр",
        color: "var(--accent-clean, #5f9e52)",
        tone: "clean",
      };
}
