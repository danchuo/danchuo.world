import type { PodcastEpisodeView, ReadingBookView } from "./api/types";
import { minutesLabel, stretchLabel } from "./podcastCard";
import { progressLabel } from "./readingCard";

/**
 * Приведение карточки борда к предмету разговора для окна пересказа (PRD §5.16.1).
 *
 * Окно у книги и у выпуска одно и то же: вопрос («что было в этом куске») и ответ (пункты плюс
 * строка-итог) не зависят от того, читали или слушали. Различается ровно шапка — и различия
 * живут здесь **данными**, а не вторым похожим компонентом: два почти одинаковых окна
 * разошлись бы по мелочам при первой же правке одного из них.
 */

/** Чей это пересказ — тот же дискриминатор, что у строки на бэкенде (`kind`). */
export type SummaryKind = "reading" | "podcast";

/** Шапка окна пересказа: всё, что борд знает про заход и без похода на бэкенд. */
export interface SummarySubject {
  kind: SummaryKind;
  /** Ключ захода: по нему тянется сам текст. */
  sessionId: number;
  /** Первая строка шапки: книга или выпуск. */
  title: string;
  /** Вторая строка: автор книги / название шоу. `null` — её нет. */
  byline: string | null;
  coverUrl: string | null;
  /** Портретная ли обложка: у книги корешок, у выпуска квадратный конверт. */
  portrait: boolean;
  /** Подпись над крупной строкой — «прочитано / прослушано за этот заход». */
  progressCaption: string;
  /** Сам кусок на языке предмета: «48% → 53%» или «35 из 48 мин». `null` — сказать нечего. */
  progressValue: string | null;
  /** Что услышит скринридер вместо шапки. */
  ariaLabel: string;
}

/**
 * Прочитанный заход как предмет окна. `null` — открывать нечем: без id захода пересказ не
 * запросить, а значит и кнопки на карточке быть не должно.
 */
export function bookSubject(book: ReadingBookView): SummarySubject | null {
  if (book.sessionId == null) return null;
  return {
    kind: "reading",
    sessionId: book.sessionId,
    title: book.title,
    byline: book.author,
    coverUrl: book.coverUrl,
    portrait: true,
    progressCaption: "прочитано за этот заход",
    progressValue: progressLabel(book),
    ariaLabel: `Что было в прочитанном куске: ${book.title}`,
  };
}

/**
 * Прослушанный заход как предмет окна. `null` — по той же причине, что у книги.
 *
 * Кусок меряется минутами, а не долями, но отвечает на тот же вопрос и той же стрелкой, что
 * проценты книги: «45 → 95 мин» против «35% → 42%». Границ окна не знаем (старый заход) —
 * откатываемся к «сколько слушали»: это меньше, чем хотелось бы, но не молчание.
 */
export function episodeSubject(episode: PodcastEpisodeView): SummarySubject | null {
  if (episode.sessionId == null) return null;
  return {
    kind: "podcast",
    sessionId: episode.sessionId,
    title: episode.episodeName,
    byline: episode.showName,
    coverUrl: episode.imageUrl,
    portrait: false,
    progressCaption: "прослушано за этот заход",
    progressValue: stretchLabel(episode) ?? minutesLabel(episode.listenedMinutes, episode.durationMinutes),
    ariaLabel: `Что было в прослушанном куске: ${episode.episodeName}`,
  };
}
