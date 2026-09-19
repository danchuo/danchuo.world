import { describe, expect, it } from "vitest";
import type { DayView, DisciplineItemView, PodcastEpisodeView, ReadingBookView } from "./api/types";
import {
  sheetCells,
  sheetHeadline,
  sheetMonster,
  sheetMonsterCard,
  sheetSessions,
} from "./daySheet";

function item(over: Partial<DisciplineItemView> & { key: string }): DisciplineItemView {
  return { label: over.key, icon: null, count: 0, target: 1, ...over };
}

function day(over: Partial<DayView> = {}): DayView {
  return {
    date: "2026-09-19",
    title: null,
    hasData: true,
    health: { steps: null, sleepMinutes: null },
    workouts: [],
    discipline: [],
    ...over,
  } as DayView;
}

const episode = (over: Partial<PodcastEpisodeView> = {}): PodcastEpisodeView => ({
  episodeName: "Осада Вены",
  episodeUrl: null,
  showName: "The Rest Is History",
  showUrl: null,
  imageUrl: "https://i/ep.jpg",
  listenedMinutes: 38,
  startMinute: 12,
  endMinute: 50,
  sessionId: 7,
  hasSummary: true,
  startedAt: "2026-09-19T09:00:00Z",
  ...over,
});

const book = (over: Partial<ReadingBookView> = {}): ReadingBookView => ({
  title: "Пятая гора",
  author: "Пауло Коэльо",
  coverUrl: "https://i/book.jpg",
  startedAt: "2026-09-19T12:00:00Z",
  readMinutes: 24,
  startPercent: 0.43,
  endPercent: 0.58,
  sessionId: 11,
  hasSummary: true,
  ...over,
});

describe("sheetSessions", () => {
  it("orders visits by when they happened, interleaving podcast and book", () => {
    const sessions = sheetSessions(
      day({
        discipline: [
          item({
            key: "podcasts",
            target: 2,
            count: 2,
            episodes: [
              episode({ sessionId: 7, startedAt: "2026-09-19T08:00:00Z" }),
              episode({ sessionId: 8, startedAt: "2026-09-19T15:00:00Z" }),
            ],
          }),
          item({
            key: "reading",
            target: 2,
            count: 2,
            books: [
              book({ sessionId: 11, startedAt: "2026-09-19T10:00:00Z" }),
              book({ sessionId: 12, startedAt: "2026-09-19T20:00:00Z" }),
            ],
          }),
        ],
      }),
    );

    expect(sessions.map((s) => s.kind)).toEqual(["podcast", "reading", "podcast", "reading"]);
    expect(sessions.map((s) => s.subject?.sessionId)).toEqual([7, 11, 8, 12]);
  });

  it("keeps an untimed visit at the end instead of floating it to the front", () => {
    const sessions = sheetSessions(
      day({
        discipline: [
          item({ key: "podcasts", target: 2, count: 2, episodes: [episode({ sessionId: 9, startedAt: null })] }),
          item({ key: "reading", target: 2, count: 1, books: [book({ sessionId: 11 })] }),
        ],
      }),
    );

    expect(sessions.map((s) => s.subject?.sessionId)).toEqual([11, 9]);
  });

  it("places the visit inside the whole work as a 0..1 span", () => {
    const [ep, bk] = sheetSessions(
      day({
        discipline: [
          item({ key: "podcasts", target: 2, count: 1, episodes: [episode({ startMinute: 15, endMinute: 30, durationMinutes: 60 })] }),
          item({ key: "reading", target: 2, count: 1, books: [book()] }),
        ],
      }),
    );

    expect(ep.span).toEqual({ from: 0.25, to: 0.5 });
    expect(bk.span).toEqual({ from: 0.43, to: 0.58 });
  });

  // A sitting whose retelling never assembled is still a sitting with an address: the frame then
  // leads to the episode at Spotify instead of being a dead picture. DESIGN §4.3
  it("keeps the episode's address on the frame, a book having none", () => {
    const [ep, bk] = sheetSessions(
      day({
        discipline: [
          item({ key: "podcasts", target: 2, count: 1, episodes: [episode({ episodeUrl: "https://open.spotify.com/episode/x" })] }),
          item({ key: "reading", target: 2, count: 1, books: [book()] }),
        ],
      }),
    );

    expect(ep.href).toBe("https://open.spotify.com/episode/x");
    expect(bk.href).toBeNull();
  });

  it("has no span when the work's length is unknown", () => {
    const [ep] = sheetSessions(
      day({
        discipline: [
          item({ key: "podcasts", target: 2, count: 1, episodes: [episode({ durationMinutes: null })] }),
        ],
      }),
    );

    expect(ep.span).toBeNull();
  });

  it("is not openable when the sitting has no retelling", () => {
    const [ep] = sheetSessions(
      day({
        discipline: [
          item({ key: "podcasts", target: 2, count: 1, episodes: [episode({ hasSummary: false })] }),
        ],
      }),
    );

    expect(ep.title).toBe("Осада Вены");
    expect(ep.subject).toBeNull();
  });

  it("reads the same book twice as two separate cards", () => {
    const sessions = sheetSessions(
      day({
        discipline: [
          item({
            key: "reading",
            target: 2,
            count: 2,
            books: [book({ sessionId: 11 }), book({ sessionId: 12, startPercent: 0.58, endPercent: 0.65 })],
          }),
        ],
      }),
    );

    expect(sessions).toHaveLength(2);
    expect(sessions[0].key).not.toBe(sessions[1].key);
    expect(sessions.map((s) => s.chunk)).toEqual(["43% → 58%", "58% → 65%"]);
  });

  it("carries the covered chunk in each kind's own units", () => {
    const sessions = sheetSessions(
      day({
        discipline: [
          item({ key: "podcasts", target: 2, count: 1, episodes: [episode()] }),
          item({ key: "reading", target: 2, count: 1, books: [book()] }),
        ],
      }),
    );

    expect(sessions[0].chunk).toBe("12 → 50 мин");
    expect(sessions[1].chunk).toBe("43% → 58%");
  });

  it("falls back to listened minutes when the episode's bounds are unknown", () => {
    const [session] = sheetSessions(
      day({
        discipline: [
          item({
            key: "podcasts",
            target: 2,
            count: 1,
            episodes: [episode({ startMinute: null, endMinute: null, durationMinutes: 61 })],
          }),
        ],
      }),
    );

    expect(session.chunk).toBe("38 из 61 мин");
  });

  it("keeps a visit with no session id but leaves it unopenable", () => {
    const [session] = sheetSessions(
      day({
        discipline: [
          item({ key: "reading", target: 2, count: 1, books: [book({ sessionId: null, hasSummary: false })] }),
        ],
      }),
    );

    expect(session.title).toBe("Пятая гора");
    expect(session.subject).toBeNull();
  });

  it("is empty for a day with no visits at all", () => {
    expect(sheetSessions(day({ discipline: [item({ key: "stretch", count: 1 })] }))).toEqual([]);
  });
});

/**
 * The FIXED socket row (DESIGN §4.3): every item keeps its place on every day, so the row's shape
 * is learnt by eye. Obligation lives in the state's verb rather than in a second channel.
 */
describe("sheetCells", () => {
  it("keeps a socket for every item, in the stored order", () => {
    const cells = sheetCells(
      day({
        discipline: [
          item({ key: "stretch", target: 1, count: 1 }),
          item({ key: "badminton", target: 0, count: 0 }),
          item({ key: "office", target: 1, count: 0 }),
        ],
      }),
    );

    expect(cells.map((c) => c.key)).toEqual(["stretch", "badminton", "office"]);
  });

  // Nothing is hidden: an item whose sittings are frames above keeps its place and says so, rather
  // than dropping out and shifting every socket to its right.
  it("keeps the socket of an item that already has frames, and marks it as framed", () => {
    const cells = sheetCells(
      day({
        discipline: [
          item({ key: "stretch", target: 1, count: 1 }),
          item({ key: "reading", target: 2, count: 1, books: [book()] }),
          item({ key: "office", target: 1, count: 0 }),
        ],
      }),
    );

    expect(cells.map((c) => [c.key, c.state])).toEqual([
      ["stretch", "done"],
      ["reading", "framed"],
      ["office", "pending"],
    ]);
  });

  it("gives each state its own name, so the socket can draw one mark per state", () => {
    const cells = sheetCells(
      day({
        discipline: [
          item({ key: "stretch", target: 1, count: 1 }),
          item({ key: "office", target: 1, count: 0 }),
          item({ key: "badminton", target: 0, count: 1 }),
          item({ key: "squash", target: 0, count: 0 }),
        ],
      }),
    );

    expect(cells.map((c) => c.state)).toEqual(["done", "pending", "extra", "unreported"]);
  });

  // The monster is a BODY, not a count: it has its own card among the frames, so it must not
  // also take a socket and be said twice.
  it("leaves the monster out of the row entirely", () => {
    const cells = sheetCells(day({ discipline: [item({ key: "stretch" }), item({ key: "monster" })] }));

    expect(cells.map((c) => c.key)).toEqual(["stretch"]);
  });

  // The count is TODAY's news and the run is its context: a partly-read day says both, which the
  // plate it replaces said neither of.
  it("prints the partial count and the live run together", () => {
    const [partly, whole] = sheetCells(
      day({
        discipline: [
          item({ key: "reading", target: 2, count: 1, occurrenceStreaks: [6, 0] }),
          item({ key: "podcasts", target: 2, count: 2, occurrenceStreaks: [3, 3] }),
        ],
      }),
    );

    expect(partly.tail).toBe("1/2 6д");
    expect(whole.tail).toBe("3д");
  });

  it("stays silent where there is neither a run nor a part", () => {
    const [cell] = sheetCells(day({ discipline: [item({ key: "office", target: 1, count: 1 })] }));

    expect(cell.tail).toBeNull();
  });

  // A run of one day is not a run, and a target of one cannot be part-done.
  it("calls neither a single day a run nor a single target a part", () => {
    const [cell] = sheetCells(
      day({ discipline: [item({ key: "office", target: 1, count: 0, occurrenceStreaks: [1] })] }),
    );

    expect(cell.tail).toBeNull();
  });

  it("shortens a sentence label for the socket, keeping an unknown one whole", () => {
    const cells = sheetCells(
      day({
        discipline: [
          item({ key: "journal", label: "Дневник перед сном", count: 1 }),
          item({ key: "squash", label: "Сквош", target: 0, count: 1 }),
        ],
      }),
    );

    expect(cells.map((c) => c.short)).toEqual(["дневник", "Сквош"]);
  });
});

describe("sheetMonster", () => {
  it("tells an unreported day from a clean one", () => {
    expect(sheetMonster(day()).verdict).toBe("unreported");
    expect(sheetMonster(day({ monsterDrunk: false })).verdict).toBe("clean");
    expect(sheetMonster(day({ monsterDrunk: true })).verdict).toBe("drunk");
  });

  it("carries the clean streak, and zeroes it on a drunk day", () => {
    expect(sheetMonster(day({ monsterDrunk: false, monsterCleanStreak: 14 })).streak).toBe(14);
    expect(sheetMonster(day({ monsterDrunk: true, monsterCleanStreak: 14 })).streak).toBe(0);
  });
});

/**
 * The monster's card (DESIGN §4.3): the verdict is spelled out in words under the figure, and an
 * unreported day says NOTHING rather than inventing a clean one (PRD §5.6).
 */
describe("sheetMonsterCard", () => {
  it("spells the clean run out in words, pluralised", () => {
    expect(sheetMonsterCard(day({ monsterDrunk: false, monsterCleanStreak: 14 })).caption).toBe(
      "14 дней не пил",
    );
    expect(sheetMonsterCard(day({ monsterDrunk: false, monsterCleanStreak: 2 })).caption).toBe(
      "2 дня не пил",
    );
  });

  // A run of one day is not a run, so the card states the fact without a numeral.
  it("drops the numeral when a single clean day is no run at all", () => {
    expect(sheetMonsterCard(day({ monsterDrunk: false, monsterCleanStreak: 1 })).caption).toBe("не пил");
  });

  it("says the drunk day plainly, and keeps silent on a day with no record", () => {
    expect(sheetMonsterCard(day({ monsterDrunk: true })).caption).toBe("пил");
    const mute = sheetMonsterCard(day());
    expect(mute.caption).toBeNull();
    expect(mute.verdict).toBe("unreported");
  });

  it("names the verdict for a screen reader even when the card is silent", () => {
    expect(sheetMonsterCard(day()).ariaLabel).toBe("Монстр: не отмечен");
    expect(sheetMonsterCard(day({ monsterDrunk: true })).ariaLabel).toBe("Монстр: выпит сегодня");
  });
});

describe("sheetHeadline", () => {
  it("speaks the canvas ribbon's grammar: weekday, day.month, then the day's name", () => {
    expect(sheetHeadline(day({ title: "суббота длиною в год" }), "2026-09-19")).toEqual({
      stamp: "суббота 19.09",
      relative: "сегодня",
      title: "суббота длиною в год",
    });
  });

  it("keeps the relative word when another day is picked", () => {
    expect(sheetHeadline(day({ date: "2026-09-18" }), "2026-09-19")).toEqual({
      stamp: "пятница 18.09",
      relative: "вчера",
      title: null,
    });
  });
});
