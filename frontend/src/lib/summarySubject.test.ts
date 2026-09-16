import { describe, expect, it } from "vitest";
import { bookSubject, episodeSubject } from "./summarySubject";
import type { PodcastEpisodeView, ReadingBookView } from "./api/types";

/**
 * Reducing a board card to the subject of the retelling window (PRD §5.16.1). The window is THE
 * SAME for a book and an episode — the question and the answer do not depend on reading or
 * listening — so the differences are data, not a second component.
 */
describe("summarySubject", () => {
  const book = (patch: Partial<ReadingBookView> = {}): ReadingBookView => ({
    title: "Дюна",
    author: "Фрэнк Герберт",
    coverUrl: "/api/reading/cover/7",
    startedAt: "2026-08-13T16:04:00Z",
    readMinutes: 32,
    startPercent: 0.48,
    endPercent: 0.53,
    sessionId: 7,
    hasSummary: true,
    ...patch,
  });

  const episode = (patch: Partial<PodcastEpisodeView> = {}): PodcastEpisodeView => ({
    episodeName: "How Feelings Make Us Smarter",
    episodeUrl: "https://open.spotify.com/episode/x",
    showName: "Hidden Brain",
    showUrl: "https://open.spotify.com/show/y",
    imageUrl: "https://i.scdn.co/image/abc",
    listenedMinutes: 35,
    startMinute: 12,
    endMinute: 47,
    durationMinutes: 48,
    sessionId: 42,
    hasSummary: true,
    ...patch,
  });

  it("у книги подпись — автор, а кусок меряется процентами", () => {
    const subject = bookSubject(book())!;

    expect(subject.kind).toBe("reading");
    expect(subject.sessionId).toBe(7);
    expect(subject.title).toBe("Дюна");
    expect(subject.byline).toBe("Фрэнк Герберт");
    expect(subject.progressValue).toBe("48% → 53%");
    expect(subject.progressCaption).toBe("прочитано за этот заход");
    expect(subject.portrait).toBe(true);
  });

  it("у выпуска подпись — шоу, а кусок меряется минутами той же стрелкой, что проценты книги", () => {
    const subject = episodeSubject(episode())!;

    expect(subject.kind).toBe("podcast");
    expect(subject.sessionId).toBe(42);
    expect(subject.title).toBe("How Feelings Make Us Smarter");
    expect(subject.byline).toBe("Hidden Brain");
    expect(subject.progressValue).toBe("12 → 47 мин");
    expect(subject.progressCaption).toBe("прослушано за этот заход");
    // An episode's cover is square: it is a sleeve, not a book's spine.
    expect(subject.portrait).toBe(false);
  });

  it("без известных границ окна выпуск откатывается к «сколько слушали»", () => {
    // An old sitting has no bounds. That is less than one would like but not silence — the window
    // still opens and shows the retelling.
    const old = episode({ startMinute: null, endMinute: null });

    expect(episodeSubject(old)!.progressValue).toBe("35 из 48 мин");
    expect(episodeSubject({ ...old, durationMinutes: null })!.progressValue).toBe("35 мин");
  });

  it("заход без ключа открыть нечем", () => {
    // The retelling hangs off the sitting's id; without it there is nothing to request and no button.
    expect(bookSubject(book({ sessionId: null }))).toBeNull();
    expect(episodeSubject(episode({ sessionId: null }))).toBeNull();
  });

  it("книга без начала показывает достигнутое, а не стрелку из ниоткуда", () => {
    // The book arrived already started (§5.16): substituting zero would credit the owner with
    // percentages they did not cover while we watched.
    expect(bookSubject(book({ startPercent: null }))!.progressValue).toBe("53%");
  });
});
