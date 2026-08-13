import { mskClock } from "./date";
import type { PodcastEpisodeView } from "./api/types";

/**
 * Формулы карточки прослушанного подкаста (PRD §5.6) — то, что нужно знать до отрисовки:
 * какой заход показать у остановки и что написать про время.
 */

/**
 * Карточка для остановки с номером [occurrence] (1-based). Карточки раздаются по порядку, и их
 * может быть МЕНЬШЕ, чем закрытых остановок: отметки считаются по сумме минут за сутки, а
 * карточки — по заходам. Марафон в один присест закрывает обе остановки и приносит одну
 * карточку — вторая остаётся без ховера, и это норма, а не потеря данных: заход-то был один.
 */
export function episodeForStop(
  episodes: PodcastEpisodeView[] | undefined,
  occurrence: number,
): PodcastEpisodeView | null {
  return episodes?.[occurrence - 1] ?? null;
}

/**
 * Строки времени в подвале карточки — одна или две.
 *
 * Заход был единственным ⇒ одна строка, «47 из 48 мин»: время начала ей не нужно, отличать
 * её не от чего. Эпизод разложен на несколько заходов ⇒ карточка сперва отвечает **за себя**
 * («09:12 · 45 мин» — вот этот заход, вот столько), а второй строкой возвращает то, что от
 * разложения теряется: сколько эпизода пройдено за весь день. Без неё «45 из 85» под утренним
 * кружком читалось бы как брошенный на середине эпизод.
 */
export function cardTimeLines(episode: PodcastEpisodeView): string[] {
  const day = minutesLabel(episode.dayMinutes, episode.durationMinutes);
  if (episode.dayMinutes <= episode.listenedMinutes) return [day];
  return [`${mskClock(episode.startedAt)} · ${episode.listenedMinutes} мин`, `${day} за день`];
}

/**
 * «47 из 48 мин», а без длительности — просто «47 мин».
 *
 * Прослушанное зажимается длительностью. Переслушанный кусок честно копится в минутах (слушал —
 * значит слушал), но «49 из 48» на карточке читалось бы как сбой счётчика, а не как повтор.
 */
function minutesLabel(minutes: number, durationMinutes: number | null | undefined): string {
  if (typeof durationMinutes !== "number") return `${minutes} мин`;
  return `${Math.min(minutes, durationMinutes)} из ${durationMinutes} мин`;
}
