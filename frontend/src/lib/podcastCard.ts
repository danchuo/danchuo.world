import type { PodcastEpisodeView } from "./api/types";

/**
 * Формулы карточки прослушанного подкаста (PRD §5.6) — то, что нужно знать до отрисовки:
 * какой эпизод показать у остановки и что написать про время.
 */

/**
 * Карточка для остановки с номером [occurrence] (1-based). Карточки раздаются по порядку, и их
 * может быть МЕНЬШЕ, чем закрытых остановок: отметки считаются по сумме минут за сутки, а
 * карточки поэпизодно. Двухчасовой эпизод закрывает обе остановки и приносит одну карточку —
 * вторая остаётся без ховера, и это норма, а не потеря данных.
 */
export function episodeForStop(
  episodes: PodcastEpisodeView[] | undefined,
  occurrence: number,
): PodcastEpisodeView | null {
  return episodes?.[occurrence - 1] ?? null;
}

/**
 * Подпись времени: «47 из 48 мин», а без длительности — просто «47 мин».
 *
 * Прослушанное зажимается длительностью. Переслушанный кусок честно копится в минутах (слушал —
 * значит слушал), но «49 из 48» на карточке читалось бы как сбой счётчика, а не как повтор.
 */
export function listenedLabel(episode: PodcastEpisodeView): string {
  const { listenedMinutes, durationMinutes } = episode;
  if (typeof durationMinutes !== "number") return `${listenedMinutes} мин`;
  return `${Math.min(listenedMinutes, durationMinutes)} из ${durationMinutes} мин`;
}
