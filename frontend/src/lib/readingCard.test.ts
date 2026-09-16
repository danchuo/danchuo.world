import { describe, expect, it } from "vitest";
import { bookForStop, progressLabel } from "./readingCard";
import type { ReadingBookView } from "./api/types";

/**
 * Formulas of the reading card (PRD §5.16). The main thing checked here is the difference between
 * zero and "we do not know": the reader keeps no progress history, so a sitting's start is not
 * always known, and substituting zero would credit a book that arrived already started.
 */

const book = (patch: Partial<ReadingBookView> = {}): ReadingBookView => ({
  title: "Хребты безумия",
  author: "Лавкрафт",
  coverUrl: "/api/reading/cover/1",
  startedAt: "2026-08-13T16:04:00Z",
  readMinutes: 32,
  startPercent: 0.35,
  endPercent: 0.42,
  ...patch,
});

describe("bookForStop", () => {
  it("раздаёт карточки остановкам по порядку", () => {
    const books = [book({ title: "первая" }), book({ title: "вторая" })];

    expect(bookForStop(books, 1)?.title).toBe("первая");
    expect(bookForStop(books, 2)?.title).toBe("вторая");
  });

  it("оставляет остановку без карточки, когда сессий меньше, чем отметок", () => {
    // An hour in one sitting closes both stops, but there is nothing to tell about a second
    // sitting — there was none.
    expect(bookForStop([book()], 2)).toBeNull();
    expect(bookForStop(undefined, 1)).toBeNull();
  });
});

describe("progressLabel", () => {
  it("показывает пройденный кусок книги", () => {
    expect(progressLabel(book())).toBe("35% → 42%");
  });

  it("книга, начатая с нуля, так и читается", () => {
    expect(progressLabel(book({ startPercent: 0, endPercent: 0.1 }))).toBe("0% → 10%");
  });

  it("без известного начала показывает только достигнутое", () => {
    // An arrow out of nowhere answers no question at all.
    expect(progressLabel(book({ startPercent: null }))).toBe("42%");
  });

  it("не двигавшийся процент не рисует стрелку сам в себя", () => {
    expect(progressLabel(book({ startPercent: 0.42, endPercent: 0.42 }))).toBe("42%");
  });

  it("дочитанная книга читается как сто процентов, а не как 99.9", () => {
    expect(progressLabel(book({ startPercent: 0.9, endPercent: 0.999 }))).toBe("90% → 100%");
  });

  it("у импортированного дня строки прогресса нет вовсе", () => {
    expect(progressLabel(book({ startPercent: null, endPercent: null }))).toBeNull();
  });
});
