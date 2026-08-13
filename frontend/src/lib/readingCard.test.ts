import { describe, expect, it } from "vitest";
import { bookForStop, progressLabel, readingTimeLine } from "./readingCard";
import type { ReadingBookView } from "./api/types";

/**
 * Формулы карточки прочитанного (PRD §5.16).
 *
 * Главное, что здесь проверяется, — разница между «ноль» и «не знаем». Читалка не хранит
 * истории прогресса, поэтому начало захода известно не всегда, и подставлять туда ноль нельзя:
 * книга, приехавшая к нам уже начатой, получила бы чужие проценты.
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
    // Час в присест: обе остановки закрыты, а рассказать о втором заходе нечего — его не было.
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
    // Стрелка из ниоткуда («→ 42%») не отвечает ни на один вопрос.
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

describe("readingTimeLine", () => {
  it("подписывает заход временем начала и минутами", () => {
    expect(readingTimeLine(book())).toBe("19:04 · 32 мин");
  });

  it("у импортированного дня остаются одни минуты", () => {
    // Тогда мы не смотрели: выдумывать время значило бы врать точнее, чем мы знаем.
    expect(readingTimeLine(book({ startedAt: null, readMinutes: 40 }))).toBe("40 мин");
  });
});
