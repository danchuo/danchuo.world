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
