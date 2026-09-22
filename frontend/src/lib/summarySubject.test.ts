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

  it("a book is captioned with the author, and its piece is measured in percent", () => {
    const subject = bookSubject(book())!;

    expect(subject.kind).toBe("reading");
    expect(subject.sessionId).toBe(7);
    expect(subject.title).toBe("Дюна");
    expect(subject.byline).toBe("Фрэнк Герберт");
    expect(subject.progressValue).toBe("48% → 53%");
    expect(subject.progressCaption).toBe("прочитано за этот заход");
    expect(subject.portrait).toBe(true);
  });

  it("an episode is captioned with the show, and its piece is measured in minutes by the same arrow as a book's percentages", () => {
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

  it("without known window bounds an episode falls back to \"how long it was listened\"", () => {
    // An old sitting has no bounds. That is less than one would like but not silence — the window
    // still opens and shows the retelling.
    const old = episode({ startMinute: null, endMinute: null });

    expect(episodeSubject(old)!.progressValue).toBe("35 из 48 мин");
    expect(episodeSubject({ ...old, durationMinutes: null })!.progressValue).toBe("35 мин");
  });

  it("an entry without a key has nothing to open with", () => {
    // The retelling hangs off the sitting's id; without it there is nothing to request and no button.
    expect(bookSubject(book({ sessionId: null }))).toBeNull();
    expect(episodeSubject(episode({ sessionId: null }))).toBeNull();
  });

  it("a book without a start shows what was reached, not an arrow out of nowhere", () => {
    // The book arrived already started (§5.16): substituting zero would credit the owner with
    // percentages they did not cover while we watched.
    expect(bookSubject(book({ startPercent: null }))!.progressValue).toBe("53%");
  });

  // The sitting's place in the whole work travels WITH the subject, so the window draws the same
  // lit run the sheet's frame draws under the cover rather than recomputing it. DESIGN §4.3
  it("carries the covered chunk as a 0..1 span of the whole work", () => {
    expect(bookSubject(book())!.span).toEqual({ from: 0.48, to: 0.53 });
    const ep = episodeSubject(episode())!.span!;
    expect(ep.from).toBeCloseTo(12 / 48, 5);
    expect(ep.to).toBeCloseTo(47 / 48, 5);
  });

  it("has no span when there is nothing to place the run on", () => {
    // Minutes without a length cannot become fractions, and a book with no start has no left end.
    expect(episodeSubject(episode({ durationMinutes: null }))!.span).toBeNull();
    expect(bookSubject(book({ startPercent: null }))!.span).toBeNull();
  });

  // The run's ends carry their own numbers, so a window that DRAWS the chunk needs no arrow
  // between them — the arrow is the previous waves' way of saying it. DESIGN §4.3
  it("names both ends of the run in the kind's own units", () => {
    expect(bookSubject(book())!.spanEnds).toEqual({ from: "48%", to: "53%" });
    expect(episodeSubject(episode())!.spanEnds).toEqual({ from: "12 мин", to: "47 мин" });
  });

  it("has no ends where it has no run", () => {
    expect(episodeSubject(episode({ durationMinutes: null }))!.spanEnds).toBeNull();
  });

  // An episode lives at Spotify, so the window's header is also the way there: the cover and the
  // name lead to the episode, the byline to the show. A book has no such address. PRD §5.16.1
  it("carries the episode's own addresses, and a book carries none", () => {
    const ep = episodeSubject(episode())!;
    expect(ep.titleUrl).toBe("https://open.spotify.com/episode/x");
    expect(ep.bylineUrl).toBe("https://open.spotify.com/show/y");

    const bk = bookSubject(book())!;
    expect(bk.titleUrl).toBeNull();
    expect(bk.bylineUrl).toBeNull();
  });

  it("reads a backwards pair as a span, not as a negative one", () => {
    // A broken reading hands the ends over swapped; the run is still a run.
    expect(bookSubject(book({ startPercent: 0.7, endPercent: 0.2 }))!.span).toEqual({ from: 0.2, to: 0.7 });
  });
});
