import { describe, expect, it } from "vitest";
import { bookSubject, episodeSubject } from "./summarySubject";
import type { PodcastEpisodeView, ReadingBookView } from "./api/types";

/**
 * Приведение карточки борда к предмету разговора для окна пересказа (PRD §5.16.1).
 *
 * Окно у книги и у выпуска **одно и то же**: вопрос («что там было») и ответ (пункты + итог) не
 * зависят от того, читали или слушали. Различается ровно шапка, и различия здесь — данные, а не
 * второй компонент: иначе два почти одинаковых окна расходились бы по мелочам при каждой правке.
 *
 * Проверяем то, в чём легко ошибиться:
 * - **подпись берётся из своего предмета**: у книги вторая строка — автор, у выпуска — шоу;
 * - **обложка книги портретная, эпизода — квадратная** (конверт против корешка);
 * - **без ключа окна нет**: заход, у которого нет id, открыть нечем — кнопки не будет;
 * - **строка «сколько» говорит на языке предмета**: проценты у книги, минуты у выпуска.
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
    startedAt: "2026-08-13T06:12:00Z",
    listenedMinutes: 35,
    dayMinutes: 35,
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

  it("у выпуска подпись — шоу, а кусок меряется минутами", () => {
    const subject = episodeSubject(episode())!;

    expect(subject.kind).toBe("podcast");
    expect(subject.sessionId).toBe(42);
    expect(subject.title).toBe("How Feelings Make Us Smarter");
    expect(subject.byline).toBe("Hidden Brain");
    expect(subject.progressValue).toBe("35 из 48 мин");
    expect(subject.progressCaption).toBe("прослушано за этот заход");
    // Обложка эпизода квадратная — это конверт, а не корешок книги.
    expect(subject.portrait).toBe(false);
  });

  it("без длительности выпуск говорит просто «сколько»", () => {
    expect(episodeSubject(episode({ durationMinutes: null }))!.progressValue).toBe("35 мин");
  });

  it("заход без ключа открыть нечем", () => {
    // Пересказ висит на id захода; без него запрашивать нечего — и кнопки быть не должно.
    expect(bookSubject(book({ sessionId: null }))).toBeNull();
    expect(episodeSubject(episode({ sessionId: null }))).toBeNull();
  });

  it("книга без начала показывает достигнутое, а не стрелку из ниоткуда", () => {
    // Книга приехала к нам уже начатой (§5.16): подставлять ноль значило бы приписать
    // владельцу проценты, которых он при нас не проходил.
    expect(bookSubject(book({ startPercent: null }))!.progressValue).toBe("53%");
  });
});
