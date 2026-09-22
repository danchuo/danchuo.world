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
  it("hands cards to the stops in order", () => {
    const books = [book({ title: "первая" }), book({ title: "вторая" })];

    expect(bookForStop(books, 1)?.title).toBe("первая");
    expect(bookForStop(books, 2)?.title).toBe("вторая");
  });

  it("leaves a stop without a card when there are fewer sessions than marks", () => {
    // An hour in one sitting closes both stops, but there is nothing to tell about a second
    // sitting — there was none.
    expect(bookForStop([book()], 2)).toBeNull();
    expect(bookForStop(undefined, 1)).toBeNull();
  });
});

describe("progressLabel", () => {
  it("shows the piece of the book covered", () => {
    expect(progressLabel(book())).toBe("35% → 42%");
  });

  it("a book started from zero reads that way", () => {
    expect(progressLabel(book({ startPercent: 0, endPercent: 0.1 }))).toBe("0% → 10%");
  });

  it("without a known start shows only what was reached", () => {
    // An arrow out of nowhere answers no question at all.
    expect(progressLabel(book({ startPercent: null }))).toBe("42%");
  });

  it("a percentage that did not move does not draw an arrow into itself", () => {
    expect(progressLabel(book({ startPercent: 0.42, endPercent: 0.42 }))).toBe("42%");
  });

  it("a finished book reads as one hundred percent, not 99.9", () => {
    expect(progressLabel(book({ startPercent: 0.9, endPercent: 0.999 }))).toBe("90% → 100%");
  });

  it("an imported day has no progress row at all", () => {
    expect(progressLabel(book({ startPercent: null, endPercent: null }))).toBeNull();
  });
});
