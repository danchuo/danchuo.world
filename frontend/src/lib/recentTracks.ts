/**
 * Схлопывание недавних треков Spotify (§5.5) — чистый расчёт, отдельно от компонента:
 * `MusicTile.tsx` должен экспортировать только компоненты, иначе Fast Refresh не сохраняет
 * состояние при правке файла.
 */

import type { RecentTrackView, TrackView } from "@/lib/api/types";

/** Идентичность недавнего трека для схлопывания: url, а без него — название + имена артистов. */
function recentKey(t: TrackView): string {
  return t.url ?? `${t.title} | ${t.artists.map((a) => a.name).join(", ")}`;
}

/**
 * Схлопывает **подряд** идущие одинаковые треки в один ряд (повтор трека, сыгранный сразу
 * после себя же), сохраняя первый — самый свежий — элемент серии (§5.5). Повторы «через один»
 * не трогаем: это отдельные прослушивания. Чистая функция — под юнит-тест.
 */
export function collapseConsecutiveRecent(recent: RecentTrackView[]): RecentTrackView[] {
  const out: RecentTrackView[] = [];
  let prevKey: string | null = null;
  for (const r of recent) {
    const key = recentKey(r.track);
    if (key === prevKey) continue;
    out.push(r);
    prevKey = key;
  }
  return out;
}

/**
 * Давность прослушивания одной короткой меткой: «сейчас», «14 мин», «3 ч», «2 дн» (§5.5).
 *
 * Список недавних отвечает на вопрос «что я слушал», и без времени он — просто набор
 * названий: одинаково выглядит трек, доигравший минуту назад, и трек позавчерашний.
 * Метка стоит в узкой колонке рядом с рядом трека, поэтому единица сокращена до одной-двух
 * букв, а не склоняется: «мин/ч/дн» одинаковы при любом числе, и колонка не пляшет.
 *
 * Единицы режутся ВНИЗ, как часы плеера: 119 минут — это ещё «1 ч». Ноль минут не пишем
 * вовсе («0 мин» читается сломанным счётчиком, а не свежестью) — до минуты это «сейчас»,
 * туда же уходит метка из будущего: часы клиента и Spotify расходятся на секунды, и
 * отрицательному числу в списке взяться неоткуда.
 *
 * Лестница обрывается на днях намеренно: Spotify отдаёт последние ~50 треков, до календарных
 * дат этот список не доживает, и заводить ради него таблицу месяцев не за чем.
 */
export function formatPlayedAgo(playedAt: string | null, nowMs: number): string | null {
  if (!playedAt) return null;
  const at = Date.parse(playedAt);
  if (Number.isNaN(at)) return null;

  const minutes = Math.floor(Math.max(0, nowMs - at) / 60_000);
  if (minutes < 1) return "сейчас";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  return `${Math.floor(hours / 24)} дн`;
}
