import { describe, expect, it } from "vitest";
import type { DayView, DisciplineItemView, PodcastEpisodeView, ReadingBookView } from "./api/types";
import {
  sheetHeadline,
  sheetLedger,
  sheetMonster,
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

describe("sheetLedger", () => {
  it("marks an item done once its count reaches the target", () => {
    const marks = sheetLedger(
      day({
        discipline: [
          item({ key: "stretch", target: 1, count: 1 }),
          item({ key: "reading", target: 2, count: 1 }),
        ],
      }),
    );

    expect(marks.map((m) => [m.key, m.done])).toEqual([
      ["stretch", true],
      ["reading", false],
    ]);
  });

  it("drops an item that already has frames — the cover above says it louder", () => {
    const marks = sheetLedger(
      day({
        discipline: [
          item({ key: "stretch", count: 1 }),
          item({ key: "reading", target: 2, count: 1, books: [book()] }),
          item({ key: "podcasts", target: 2, count: 0 }),
        ],
      }),
    );

    expect(marks.map((m) => m.key)).toEqual(["stretch", "podcasts"]);
  });

  it("leaves the monster out — it is a verdict, not an achievement", () => {
    const marks = sheetLedger(
      day({ discipline: [item({ key: "stretch", count: 1 }), item({ key: "monster" })] }),
    );

    expect(marks.map((m) => m.key)).toEqual(["stretch"]);
  });

  it("hides an optional item (no target) that was not reported", () => {
    const marks = sheetLedger(
      day({ discipline: [item({ key: "stretch", count: 1 }), item({ key: "squash", target: 0 })] }),
    );

    expect(marks.map((m) => m.key)).toEqual(["stretch"]);
  });

  it("shows an optional item once it is reported, already done", () => {
    const marks = sheetLedger(
      day({ discipline: [item({ key: "badminton", target: 0, count: 1 })] }),
    );

    expect(marks).toEqual([
      expect.objectContaining({ key: "badminton", done: true, optional: true }),
    ]);
  });

  it("shortens a sentence label into a square's caption, keeping an unknown one whole", () => {
    const marks = sheetLedger(
      day({
        discipline: [
          item({ key: "journal", label: "Дневник перед сном", count: 1 }),
          item({ key: "squash", label: "Сквош", target: 0, count: 1 }),
        ],
      }),
    );

    expect(marks.map((m) => m.short)).toEqual(["дневник", "Сквош"]);
  });

  it("takes the headline streak from the first occurrence", () => {
    const marks = sheetLedger(
      day({ discipline: [item({ key: "reading", target: 2, count: 2, occurrenceStreaks: [14, 3] })] }),
    );

    expect(marks[0].streak).toBe(14);
  });

  it("reads a missing streak as none rather than crashing", () => {
    const marks = sheetLedger(day({ discipline: [item({ key: "office", count: 1 })] }));

    expect(marks[0].streak).toBe(0);
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

describe("sheetHeadline", () => {
  it("speaks the canvas ribbon's grammar: weekday, day.month, then the day's name", () => {
    expect(sheetHeadline(day({ title: "суббота длиною в год" }), "2026-09-19")).toEqual({
      stamp: "сб 19.09",
      relative: "сегодня",
      title: "суббота длиною в год",
    });
  });

  it("keeps the relative word when another day is picked", () => {
    expect(sheetHeadline(day({ date: "2026-09-18" }), "2026-09-19")).toEqual({
      stamp: "пт 18.09",
      relative: "вчера",
      title: null,
    });
  });
});
